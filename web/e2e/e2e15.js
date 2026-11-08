// Per-class high school approval (Non-CCAP), free-entry concurrent classes, young student review.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { grantConsent, fillProfile } = require('./testlib');
const B = 'http://localhost:3100';
const DIR = __dirname;
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext(desk)).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
async function signup(b, first, email, school, grade, sid) {
  const s = await (await b.newContext(desk)).newPage();
  await s.goto(B + '/signup');
  await s.fill('#first', first); await s.fill('#last', 'Test'); await s.fill('#email', email);
  await s.selectOption('#school', { label: school });
  await s.selectOption('#grade', String(grade));
  const grads = await s.locator('#grad option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
  await s.selectOption('#grad', grade <= 8 ? grads.at(-1) : grads[1]);
  await s.fill('#sid', sid); await s.fill('#pw', 'studentpass1'); await s.fill('#pw2', 'studentpass1');
  await fillProfile(s);
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/steps/1');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent(email);
  return s;
}

(async () => {
  const b = await chromium.launch();

  // ---- A: Non-CCAP school, per-class high school approval ----
  const e = await signup(b, 'Eli', 'eli.t@student.example.org', 'Enterprise High School · Shasta Union HSD', 11, '0416001');
  await e.goto(B + '/student/steps/2');
  check(await e.locator('[data-kind="de"]').innerText().then((t) => t.includes('PSYC C1000') && t.includes('Period TBD · Teacher TBD')), 'test DE list with TBD period/teacher');
  await e.click('[data-kind="de"] label:has-text("PSYC C1000")');
  await e.click('[data-kind="de"] label:has-text("STAT C1000")');
  await e.click('button:has-text("Add a concurrent class")');
  await e.fill('input[name="ce_code"]', 'hist c1010'); await e.fill('input[name="ce_units"]', '3');
  const totals = await e.locator('.kicker-sm:has-text("Units by term")').innerText();
  check(/10 of 11 units/i.test(totals), `term total adds DE + CE units (${totals.replace(/\s+/g, ' ')})`);
  await Promise.all([e.waitForURL(/complete/), e.click('button:has-text("Submit courses")')]);
  await e.goto(B + '/student/steps/4');
  check((await e.content()).includes('Awaiting HS approval'), 'each class shows awaiting HS approval');

  const rosa = await login(b, 'ralvarez@suhsd.net');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Eli Test")')]);
  check(await rosa.locator('[data-class]').count() === 3, 'staff decide 3 classes one by one');
  await rosa.locator('[data-class="STAT C1000"] label:has-text("Decline")').click();
  await rosa.fill('#note', 'Take STAT next year after Algebra 2.');
  await rosa.click('label.seg-opt:has-text("Type")');
  await rosa.waitForTimeout(500);
  await Promise.all([rosa.waitForURL(/done=changes/), rosa.click('button:has-text("Save decisions & sign digitally")')]);
  check(true, 'staff approved 2, declined 1 with a note');

  await e.goto(B + '/student/steps/2');
  const page2 = await e.content();
  check(page2.includes('Take STAT next year'), 'student sees the decline note');
  const ceVal = await e.locator('input[name="ce_code"]').inputValue();
  check(ceVal === 'HIST C1010', 'concurrent class kept (normalized code)');
  await e.click('[data-kind="de"] label:has-text("MATH C2210")');
  await Promise.all([e.waitForURL(/complete/), e.click('button:has-text("Resubmit courses")')]);
  await rosa.goto(B + '/counselor');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Eli Test")')]);
  check(await rosa.locator('[data-class]').count() === 1, 'only the new class needs approval again');
  await rosa.click('label.seg-opt:has-text("Type")');
  await rosa.waitForTimeout(500);
  await Promise.all([rosa.waitForURL(/done=approved/), rosa.click('button:has-text("Approve & sign digitally")')]);
  await e.goto(B + '/student');
  await e.goto(B + '/student/steps/4/complete');
  check(!(await e.content()).includes('Awaiting HS approval'), 'high school approval complete');

  // Audit PDF shows per-class approvals.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  await tab.goto(B + '/admin/audit?ids=0416001');
  const href = await tab.locator('a:has-text("Download PDF")').getAttribute('href');
  require('fs').writeFileSync(DIR + '/eli.pdf', await (await tab.request.get(B + href)).body());
  const text = execFileSync('pdftotext', ['-layout', DIR + '/eli.pdf', '-']).toString().replace(/\s+/g, ' ');
  check(/PSYC C1000 \(Spring 2027\), HIST C1010 \(Spring 2027\): approved and digitally signed/.test(text) || /HIST C1010 \(Spring 2027\), PSYC C1000 \(Spring 2027\): approved/.test(text), 'PDF: first batch signed');
  check(/MATH C2210 \(Spring 2027\): approved and digitally signed/.test(text), 'PDF: second batch signed separately');

  // ---- B: CCAP school, young student ----
  const y = await signup(b, 'Ava', 'ava.t@student.example.org', 'Anderson High School · Anderson Union HSD', 7, '0416002');
  await y.goto(B + '/student');
  const dash = await y.content();
  check(!dash.includes('High school approval'), 'CCAP: no high school approval step');
  check(dash.includes('Young student documents'), 'young student sees the documents step');
  await y.goto(B + '/student/steps/2');
  await y.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await Promise.all([y.waitForURL(/complete/), y.click('button:has-text("Submit courses")')]);
  await y.goto(B + '/student/steps/9');
  await y.setInputFiles('#transcript', DIR + '/signed-form.pdf');
  await y.setInputFiles('#letter', DIR + '/signed-form.pdf');
  await Promise.all([y.waitForURL(/complete/), y.click('button:has-text("Send documents")')]);
  check(true, 'young student uploaded report card + principal letter');

  const dana = await login(b, 'dortiz@shastacollege.edu');
  await dana.goto(B + '/admin/students?tab=young');
  check((await dana.content()).includes('Waiting on a college counselor'), 'approver waits for the recommendation first');
  const jordan = await login(b, 'jkim@shastacollege.edu');
  await jordan.goto(B + '/admin/students');
  check(await jordan.locator('a.seg-opt:has-text("Young students · 1")').count() === 1, 'Young students tab shows when one is waiting');
  await jordan.goto(B + '/admin/students?tab=young');
  await jordan.locator('label:has-text("Recommend")').first().click();
  await jordan.fill('#n10r', 'Strong report card; principal letter is specific to ENGL C1000.');
  await Promise.all([jordan.waitForURL(/done=young_rec/), jordan.click('button:has-text("Save recommendation")')]);
  await jordan.locator('text=Waiting on a Young Student Approver').waitFor({ timeout: 10000 }); check(true, 'recommender cannot make the final call');
  await dana.goto(B + '/admin/students?tab=young');
  check((await dana.content()).includes('Strong report card'), 'approver sees the feedback');
  await dana.locator('label:has-text("Approve")').last().click();
  await Promise.all([dana.waitForURL(/done=young_approved/), dana.click('button:has-text("Save decision")')]);
  await dana.goto(B + '/admin/students');
  check(await dana.locator('a.seg-opt:has-text("Young students")').count() === 0, 'tab hides when none are waiting');
  await y.goto(B + '/student');
  check((await y.content()).includes('checking your units'), 'approved young student moves to Clear units');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
