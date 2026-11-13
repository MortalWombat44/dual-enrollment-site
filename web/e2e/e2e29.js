// Approver review: students at an unlisted ("Other") school or homeschool name who approves their classes; a college
// admin confirms that person or changes them. The link goes out right away; College review waits for the review.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent, clearUnits } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const desk = { viewport: { width: 1400, height: 1000 } };

async function login(b, email) {
  const p = await (await b.newContext(desk)).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', 'shasta2027');
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
async function signup(b, o) {
  const s = await (await b.newContext(desk)).newPage();
  await s.goto(B + '/signup'); await s.waitForLoadState('networkidle');
  await s.fill('#first', o.first); await s.fill('#last', 'Test'); await s.fill('#email', o.email);
  await s.selectOption('#school', o.school);
  if (o.school === 'other') await s.fill('#other_school', 'Trinity High School');
  await s.fill('#approver_name', o.approver[0]); await s.fill('#approver_email', o.approver[1]);
  await s.selectOption('#grade', '11');
  const grads = await s.locator('#grad option').evaluateAll((x) => x.map((y) => y.value).filter(Boolean)); await s.selectOption('#grad', grads[1]);
  await s.fill('#dob', '2010-02-02'); await s.fill('#phone', '530 555 0142'); await s.fill('#address', '12 Oak St'); await s.fill('#city', 'Weaverville'); await s.fill('#zip', '96093');
  await s.fill('#sid', o.sid); await s.fill('#pw', 'testpass123'); await s.fill('#pw2', 'testpass123');
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent(o.email);
  await s.goto(B + '/student/steps/2'); await s.waitForLoadState('networkidle');
  await s.locator('button:has-text("Add a concurrent class")').click();
  await s.locator('input[name="ce_code"]').fill('PSYC C1000'); await s.locator('input[name="ce_units"]').fill('3');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);
  return s;
}
// The named approver opens their link and approves every class.
async function approveByLink(b, student) {
  await student.goto(B + '/student/steps/4');
  await Promise.all([student.waitForURL(/approver_link=/), student.locator('button:has-text("Send approval link")').click()]);
  const link = (await student.locator('code').first().innerText()).trim();
  const ap = await (await b.newContext(desk)).newPage();
  await ap.goto(link); await ap.waitForLoadState('networkidle');
  await ap.click('label.seg-opt:has-text("Type")'); await ap.waitForTimeout(500);
  await Promise.all([ap.waitForURL(/done=approved/), ap.click('button:has-text("Approve & sign digitally")')]);
  return link;
}

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const row = (email) => sql('SELECT id, hs_approver_name AS name, hs_approver_email AS email, hs_approver_status AS status FROM users WHERE email = ?', email)[0];
  const req = (id) => sql('SELECT hs_status, hs_signer_email FROM course_requests WHERE student_id = ?', id)[0];

  // --- Unlisted school: the student names the front-office secretary ---
  const o = await signup(b, { first: 'Otto', email: 'otto.o@student.example.org', school: 'other', sid: '0420003', approver: ['Sam Secretary', 'frontdesk@trinity.example.org'] });
  const otto = row('otto.o@student.example.org');
  check(otto.status === 'pending', 'named approver waits for Shasta College review');
  check(sql("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'approver' AND student_id = ?", otto.id)[0].n > 0, 'college admins are notified');
  await o.goto(B + '/student/steps/4');
  check(await seen(o, '[data-approver-status] >> text=Shasta College also checks that this is the right person'), 'student is told Shasta College checks the approver');
  const oldLink = await approveByLink(b, o);
  check(req(otto.id).hs_status === 'approved' && req(otto.id).hs_signer_email === 'frontdesk@trinity.example.org', 'link went out right away: the named person approved the class');

  // --- College admin: sees it waiting; College review can't be cleared until the approver is reviewed ---
  const jk = await login(b, 'jkim@shastacollege.edu');
  await jk.goto(B + '/admin/students');
  check(await seen(jk, 'a.seg-opt:has-text("Approver review · 1")'), 'Approver review tab shows while one is waiting');
  await jk.goto(`${B}/admin/students?tab=approver&student=${otto.id}`);
  check(await seen(jk, '[data-approver-review="pending"] >> text=not office staff') && (await jk.inputValue('#ap_email')) === 'frontdesk@trinity.example.org', 'panel shows the named approver to review');
  check(await seen(jk, 'text=Review the high school approver above first'), 'College review says the approver comes first');
  await clearUnits(jk);
  await jk.waitForURL(/error=approver_review/);
  check(await seen(jk, 'text=College review can’t be cleared until the approver is confirmed'), 'College review is blocked until the approver is reviewed');

  // --- Admin changes the approver to the principal ---
  await jk.goto(`${B}/admin/students?tab=approver&student=${otto.id}`);
  await jk.fill('#ap_name', 'Dr. Pat Principal'); await jk.fill('#ap_email', 'principal@trinity.example.org');
  await Promise.all([jk.waitForURL(/done=approver_changed/), jk.click('button:has-text("Confirm approver")')]);
  const after = row('otto.o@student.example.org');
  check(after.status === 'approved' && after.email === 'principal@trinity.example.org' && after.name === 'Dr. Pat Principal', 'approver changed and confirmed');
  check(req(otto.id).hs_status === 'pending' && req(otto.id).hs_signer_email === null, 'the old person’s approval goes back to waiting');
  check(await seen(jk, '.flash >> text=PSYC C1000 went back to waiting for the new approver'), 'admin is told what was reset, with the new link');
  const newLink = (await jk.locator('.flash code').first().innerText()).trim();
  const old = await (await b.newContext(desk)).newPage();
  await old.goto(oldLink); await old.waitForLoadState('networkidle');
  check((await old.locator('button:has-text("Approve & sign digitally")').count()) === 0, 'the old approver’s link no longer works');
  const np = await (await b.newContext(desk)).newPage();
  await np.goto(newLink); await np.waitForLoadState('networkidle');
  check(await np.locator('[data-class="PSYC C1000"]').count() === 1, 'the new approver’s link works');
  await np.click('label.seg-opt:has-text("Type")'); await np.waitForTimeout(500);
  await Promise.all([np.waitForURL(/done=approved/), np.click('button:has-text("Approve & sign digitally")')]);
  check(req(otto.id).hs_signer_email === 'principal@trinity.example.org', 'approved by the confirmed approver');
  await jk.goto(`${B}/admin/students`);
  check((await jk.locator('a.seg-opt:has-text("Approver review")').count()) === 0, 'Approver review tab goes away when nothing is waiting');
  await jk.goto(`${B}/admin/students?tab=units&student=${otto.id}`);
  await clearUnits(jk);
  await jk.waitForURL(/done=cleared/);
  check(true, 'College review clears once the approver is confirmed');
  const hist = jk.locator('[data-history]'); // older term groups are collapsed, so count rather than wait for visible text
  check(await hist.getByText('High school approver changed and confirmed').count() > 0 && await hist.getByText('set back to waiting', { exact: false }).count() > 0, 'history records the review and the reset');
  await o.goto(B + '/student/account');
  check((await o.inputValue('#approver_email')) === 'principal@trinity.example.org' && await seen(o, 'text=(confirmed)'), 'student sees the corrected, confirmed approver');

  // --- Student changes the approver later: reviewed again, earlier approvals stay ---
  await o.fill('#approver_name', 'Vera Vice'); await o.fill('#approver_email', 'vp@trinity.example.org');
  await Promise.all([o.waitForURL(/saved=approver/), o.click('button:has-text("Save approver")')]);
  check(row('otto.o@student.example.org').status === 'pending' && req(otto.id).hs_status === 'approved', 'student’s change is reviewed again; approvals already given stay');

  // --- Homeschool: names the home school administrator; same review, confirmed as is ---
  const h = await signup(b, { first: 'Hana', email: 'hana.h@student.example.org', school: 'homeschool', sid: '0420004', approver: ['Hiro Hale', 'hiro.hale@example.org'] });
  const hana = row('hana.h@student.example.org');
  check(hana.status === 'pending' && hana.email === 'hiro.hale@example.org', 'homeschooled student names an approver, waiting for review');
  await h.goto(B + '/student');
  const steps = await h.locator('body').innerText();
  check(steps.includes('High school approval') && steps.includes('Private School Affidavit'), 'homeschool: approval by the named approver, plus the affidavit');
  await approveByLink(b, h);
  check(req(hana.id).hs_signer_email === 'hiro.hale@example.org', 'homeschool approver approves by link');
  await jk.goto(`${B}/admin/students?tab=approver&student=${hana.id}`);
  check(await seen(jk, '[data-approver-review="pending"] >> text=administrator of their home school'), 'admin reviews the homeschool approver');
  await Promise.all([jk.waitForURL(/done=approver_ok/), jk.click('button:has-text("Confirm approver")')]);
  check(row('hana.h@student.example.org').status === 'approved' && req(hana.id).hs_status === 'approved', 'confirmed without changes: approvals stay');
  check(await seen(jk, '[data-approver-review="approved"] >> text=confirmed by Jordan Kim'), 'panel shows who confirmed the approver');

  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
