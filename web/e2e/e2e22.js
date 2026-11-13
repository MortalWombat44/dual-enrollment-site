// Date of birth (18+ skips consent), contact info, seniors' plans + export, Other high school + outside approver,
// homeschool + affidavit review, lead notifications, help flags.
const { chromium } = require('playwright');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext(desk)).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  await p.waitForLoadState('networkidle');
  return p;
}
async function signup(b, o) {
  const s = await (await b.newContext(desk)).newPage();
  await s.goto(B + '/signup'); await s.waitForLoadState('networkidle');
  await s.fill('#first', o.first); await s.fill('#last', o.last || 'Test'); await s.fill('#email', o.email);
  if (o.school === 'other' || o.school === 'homeschool') await s.selectOption('#school', o.school); else await s.selectOption('#school', { label: o.school });
  if (o.school === 'other') { await s.fill('#other_school', o.otherName); await s.fill('#approver_name', 'Pat Lee'); await s.fill('#approver_email', 'pat.lee@trinity.example.org'); }
  if (o.school === 'homeschool') { await s.fill('#approver_name', 'Hiro Hale'); await s.fill('#approver_email', 'hiro.hale@example.org'); }
  await s.selectOption('#grade', String(o.grade ?? 11));
  const grads = await s.locator('#grad option').evaluateAll((x) => x.map((y) => y.value).filter(Boolean)); await s.selectOption('#grad', o.grade === 12 ? grads[0] : grads[1]);
  await s.fill('#dob', o.dob); await s.fill('#phone', '530 555 0142'); await s.fill('#address', '12 Oak St'); await s.fill('#city', 'Weaverville'); await s.fill('#zip', '96093');
  if (o.grade === 12) await s.locator('input[name="plans"][value="yes"]').check();
  await s.fill('#sid', o.sid); await s.fill('#pw', 'testpass123'); await s.fill('#pw2', 'testpass123');
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  return s;
}
const stepsText = async (s) => { await s.goto(B + '/student'); return s.locator('body').innerText(); };
const notices = (email) => sql('SELECT n.kind, n.message FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ?', email);

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();

  // 1 · Date of birth: 18+ today skips parent consent; 17 (even if 18 by registration) does not.
  const adult = await signup(b, { first: 'Ada', email: 'ada.a@student.example.org', school: 'Anderson High School · Anderson Union HSD', grade: 12, dob: '2008-01-05', sid: '0420001' });
  const t1 = await stepsText(adult);
  check(!t1.includes('Parent consent'), '18+ student: no parent consent step');
  check(sql("SELECT phone, city, plans_shasta FROM users WHERE email = 'ada.a@student.example.org'")[0].phone === '(530) 555-0142', 'phone saved (formatted)');
  const nextYear = new Date(); nextYear.setMonth(nextYear.getMonth() + 1); nextYear.setFullYear(nextYear.getFullYear() - 18);
  const minor = await signup(b, { first: 'Milo', email: 'milo.m@student.example.org', school: 'Anderson High School · Anderson Union HSD', grade: 12, dob: nextYear.toISOString().slice(0, 10), sid: '0420002' });
  check((await stepsText(minor)).includes('Parent consent'), 'turns 18 next month: still needs parent consent today');

  // 2 · Existing students missing profile details are asked first.
  sql("UPDATE users SET date_of_birth = NULL, phone = NULL WHERE email = 'jamie.l@student.andersonhigh.org'");
  const jm = await login(b, 'jamie.l@student.andersonhigh.org');
  check(jm.url().endsWith('/complete-profile'), 'missing details: sent to the profile page first');
  await jm.fill('#dob', '2010-04-02'); await jm.fill('#phone', '5305550111');
  await Promise.all([jm.waitForURL(/\/student$/), jm.click('button:has-text("Save and continue")')]);
  check(true, 'profile saved, continues to dashboard');

  // 3 · Seniors' plans: yearly confirmation asks 12th graders; export for super admins + college counselors.
  sql("UPDATE users SET grade_confirmed_year = 2000 WHERE email = 'ada.a@student.example.org'");
  await adult.goto(B + '/student'); await adult.waitForURL(/confirm-grade/); await adult.waitForLoadState('networkidle');
  await adult.selectOption('#grade', '12');
  check(await adult.locator('text=Do you plan to attend Shasta College after high school?').count() === 1, 'grade 12 confirmation asks about Shasta College plans');
  await adult.locator('input[name="plans"][value="unsure"]').check();
  const grads = await adult.locator('#grad option').evaluateAll((x) => x.map((y) => y.value).filter(Boolean)); await adult.selectOption('#grad', grads[0]);
  await Promise.all([adult.waitForURL(/\/student$/), adult.click('button:has-text("Confirm and continue")')]);
  const jordan = await login(b, 'jkim@shastacollege.edu');
  const csv = await (await jordan.request.get(B + '/admin/seniors.csv')).text();
  check(csv.includes('"Ada"') && csv.includes('"Not sure yet"') && csv.includes('(530) 555-0142'), 'college counselor exports seniors with plans and contact info');
  check((await adult.request.get(B + '/admin/seniors.csv')).status() === 404, 'students cannot export');

  // 4 · Other high school + outside approver link.
  const o = await signup(b, { first: 'Otto', email: 'otto.o@student.example.org', school: 'other', otherName: 'Trinity High School', dob: '2010-02-02', sid: '0420003' });
  grantConsent('otto.o@student.example.org');
  await o.goto(B + '/student/steps/2'); await o.waitForLoadState('networkidle');
  await o.locator('button:has-text("Add a concurrent class")').click();
  await o.locator('input[name="ce_code"]').fill('PSYC C1000'); await o.locator('input[name="ce_units"]').fill('3');
  await Promise.all([o.waitForURL(/complete/), o.click('button:has-text("Submit courses")')]);
  await o.goto(B + '/student/steps/4');
  check(await o.locator('text=Pat Lee').count() > 0, 'student sees their named approver');
  await Promise.all([o.waitForURL(/approver_link=/), o.click('button:has-text("Send approval link to Pat Lee")')]);
  const link = (await o.locator('code').first().innerText()).trim();
  const ap = await (await b.newContext(desk)).newPage();
  await ap.goto(link); await ap.waitForLoadState('networkidle');
  check(await ap.locator('text=Otto Test').count() > 0 && await ap.locator('[data-class="PSYC C1000"]').count() === 1, 'approver opens the link without an account');
  await ap.click('label.seg-opt:has-text("Type")'); await ap.waitForTimeout(500);
  await Promise.all([ap.waitForURL(/done=approved/), ap.click('button:has-text("Approve & sign digitally")')]);
  check(sql("SELECT hs_status, hs_signer_email FROM course_requests r JOIN users u ON u.id = r.student_id WHERE u.email = 'otto.o@student.example.org'")[0].hs_signer_email === 'pat.lee@trinity.example.org', 'approved by the outside approver (email recorded)');
  check(sql("SELECT kind, district FROM schools WHERE name = 'Trinity High School'")[0].kind === 'other', 'unlisted school added as Other');

  // 5 · Homeschool: affidavit step, leads notified, admin review.
  const d = await login(b, 'dortiz@shastacollege.edu');
  const h = await signup(b, { first: 'Hana', email: 'hana.h@student.example.org', school: 'homeschool', dob: '2010-06-06', sid: '0420004' });
  check(notices('dortiz@shastacollege.edu').some((n) => n.kind === 'homeschool'), 'no homeschool lead yet: super admins notified of the new homeschooled student');
  await d.goto(B + '/admin/users?role=admin'); await d.waitForLoadState('networkidle');
  const jr = d.locator('tr:has-text("Jordan Kim")');
  await jr.locator('summary').click(); await jr.locator('input[name="homeschool_lead"]').check(); await jr.locator('input[name="young_lead"]').check();
  await Promise.all([d.waitForURL(/updated=/), jr.locator('button:has-text("Save")').click()]);
  check(/Homeschool lead/.test(await d.locator('tr:has-text("Jordan Kim")').innerText()), 'Users page: Jordan marked Homeschool lead and Young student lead');
  grantConsent('hana.h@student.example.org');
  const hs = await stepsText(h);
  check(hs.includes('Private School Affidavit') && hs.includes('High school approval'), 'homeschool: affidavit step, plus approval by the approver they named');
  const pdf = fs.readFileSync(__dirname + '/signed-form.pdf');
  const upload = async () => {
    await h.goto(B + '/student/steps/11');
    await h.setInputFiles('#affidavit', { name: 'affidavit.pdf', mimeType: 'application/pdf', buffer: pdf });
    await h.click('button:has-text("Send for review")');
    await h.locator('text=Shasta College is reviewing your Private School Affidavit').first().waitFor();
  };
  await upload();
  check(notices('jkim@shastacollege.edu').some((n) => n.kind === 'homeschool' && /affidavit/i.test(n.message)), 'homeschool lead notified of the affidavit');
  await jordan.goto(B + '/admin/notifications');
  check(/Notifications · \d/.test(await jordan.locator('.admin-nav').innerText()), 'unread count in the admin menu');
  await jordan.goto(B + '/admin/students?tab=homeschool'); await jordan.waitForLoadState('networkidle');
  await jordan.locator('input[name="decision"][value="decline"]').locator('xpath=..').click();
  await jordan.fill('#n11', 'This is last year’s affidavit. Please upload this year’s.');
  await Promise.all([jordan.waitForURL(/affidavit_declined/), jordan.click('button:has-text("Save decision")')]);
  await h.goto(B + '/student/steps/11');
  check(await h.locator('text=last year').count() > 0, 'student sees why the affidavit was declined');
  await upload();
  await jordan.goto(B + '/admin/students?tab=homeschool'); await jordan.waitForLoadState('networkidle');
  await jordan.locator('input[name="decision"][value="approve"]').locator('xpath=..').click();
  await Promise.all([jordan.waitForURL(/affidavit_ok/), jordan.click('button:has-text("Save decision")')]);
  check(/Private School Affidavit[\s\S]*Approved/.test(await stepsText(h)), 'affidavit approved: step complete');

  // 6 · Help flags: Enterprise has a primary admin (Jordan) → only Jordan; Anderson has none → every admin.
  sql('DELETE FROM notifications');
  const maya = await login(b, 'maya.r@student.suhsd.net');
  await maya.fill('#help-message', "I can't find where to add my Shasta College ID.");
  await Promise.all([maya.waitForURL(/help=sent/), maya.click('button:has-text("I need help")')]);
  check(notices('jkim@shastacollege.edu').some((n) => n.kind === 'help') && !notices('dortiz@shastacollege.edu').some((n) => n.kind === 'help'), 'Enterprise student: only the primary-school admin is notified');
  await jm.goto(B + '/student'); await jm.waitForLoadState('networkidle');
  await jm.fill('#help-message', 'My class is not listed.');
  await Promise.all([jm.waitForURL(/help=sent/), jm.click('button:has-text("I need help")')]);
  check(notices('dortiz@shastacollege.edu').some((n) => /Jamie/.test(n.message)) && notices('jkim@shastacollege.edu').some((n) => /Jamie/.test(n.message)), 'school with no primary admin: everyone notified');
  const rosa = await login(b, 'ralvarez@suhsd.net');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Lucas Hart")')]); await rosa.waitForLoadState('networkidle');
  await rosa.fill('textarea[name="message"][placeholder="Where is the student stuck?"]', 'Lucas is stuck on CCCApply.');
  await Promise.all([rosa.waitForURL(/done=help/), rosa.click('button:has-text("Flag for help")')]);
  check(notices('jkim@shastacollege.edu').some((n) => /Rosa Alvarez \(high school staff\) flagged Lucas/.test(n.message)), 'high school staff flag reaches the primary admin');
  await jordan.goto(B + '/admin/students?tab=help'); await jordan.waitForLoadState('networkidle');
  check(/Help · 3/.test(await jordan.locator('.seg').first().innerText()), 'Help tab lists the three students');
  await jordan.goto(B + '/admin/students?tab=help&student=' + sql("SELECT id FROM users WHERE email = 'maya.r@student.suhsd.net'")[0].id); await jordan.waitForLoadState('networkidle');
  await jordan.locator('textarea[name="reply"]').first().fill('Go to step 01 and type it in.');
  await Promise.all([jordan.waitForURL(/help_resolved/), jordan.locator('button:has-text("Mark resolved")').first().click()]);
  await maya.goto(B + '/student');
  check(await maya.locator('text=Go to step 01 and type it in.').count() === 1, 'student sees the reply');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
