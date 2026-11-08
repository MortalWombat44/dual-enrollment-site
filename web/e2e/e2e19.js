// Students can request more classes any time, even while others are in review.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent, addCe, fillProfile } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const reqs = (email) => { const d = new DatabaseSync(DB); const r = d.prepare(`SELECT c.code || ':' || r.hs_status AS x FROM course_requests r JOIN courses c ON c.id = r.course_id JOIN users u ON u.id = r.student_id WHERE u.email = ? ORDER BY c.code`).all(email); d.close(); return r.map((x) => x.x).join(', '); };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
async function signup(b, first, email, school, sid) {
  const s = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await s.goto(B + '/signup');
  await s.fill('#first', first); await s.fill('#last', 'More'); await s.fill('#email', email);
  await s.selectOption('#school', { label: school }); await s.selectOption('#grade', '11');
  const grads = await s.locator('#grad option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean)); await s.selectOption('#grad', grads[1]);
  await s.fill('#sid', sid); await s.fill('#pw', 'morepass123'); await s.fill('#pw2', 'morepass123');
  await fillProfile(s);
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent(email);
  return s;
}
const requestMore = async (s, fn) => {
  await s.goto(B + '/student'); await s.click('a:has-text("Request more classes")');
  await s.waitForSelector('#more'); await s.waitForLoadState('networkidle');
  await fn(s.locator('#more'));
  await Promise.all([s.waitForURL(/added=/), s.click('button:has-text("Request these classes")')]);
  await s.locator('#more .flash').waitFor();
};

(async () => {
  const b = await chromium.launch();
  // Non-CCAP: add a class while high school approval is pending.
  const E = 'nia.m@student.example.org';
  const s = await signup(b, 'Nia', E, 'Enterprise High School · Shasta Union HSD', '0419001');
  await s.goto(B + '/student/steps/2');
  await s.click('[data-kind="de"] label:has-text("PSYC C1000")');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);
  await requestMore(s, async (m) => {
    check(/3 of 11 units/i.test(await m.locator('.kicker-sm:has-text("Units by term")').innerText()), 'term total includes classes already requested');
    await m.locator('[data-kind="de"] label:has-text("STAT C1000")').click();
  });
  check(await s.locator('text=Requested 1 more class').count() === 1, 'student told the class was requested');
  check(reqs(E) === 'PSYC C1000:pending, STAT C1000:pending', `both classes pending high school approval (${reqs(E)})`);
  const rosa = await login(b, 'ralvarez@suhsd.net');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Nia More")')]);
  check(await rosa.locator('[data-class]').count() === 2, 'high school sees both classes to decide');
  await rosa.click('label.seg-opt:has-text("Type")'); await rosa.waitForTimeout(400);
  await Promise.all([rosa.waitForURL(/done=approved/), rosa.click('button:has-text("Approve & sign digitally")')]);

  // Now in Clear units: add a concurrent class. Approved classes stay approved; only the new one goes to the high school.
  await requestMore(s, async (m) => { await addCe(s, 'HIST C1010', 3); });
  check(reqs(E) === 'HIST C1010:pending, PSYC C1000:approved, STAT C1000:approved', `earlier approvals kept, new class pending (${reqs(E)})`);
  await s.goto(B + '/student');
  check(await s.locator('text=High school approval').count() > 0, 'high school approval open again for the new class');

  // CCAP: add while waiting on Clear units. Student stays in Clear units with all classes.
  const J = 'jamie.l@student.andersonhigh.org';
  const jm = await login(b, J);
  await jm.goto(B + '/student/steps/1'); await Promise.all([jm.waitForURL(/complete/), jm.click('button:has-text("Save my ID")')]);
  grantConsent(J);
  await jm.goto(B + '/student/steps/2');
  await jm.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await Promise.all([jm.waitForURL(/complete/), jm.click('button:has-text("Submit courses")')]);
  await requestMore(jm, async () => { await addCe(jm, 'COMM C1000', 3); });
  const j = await login(b, 'jkim@shastacollege.edu');
  await Promise.all([j.waitForURL(/student=/), j.locator('a.rowa', { hasText: 'Jamie Lee' }).click()]);
  await j.waitForLoadState('networkidle');
  const panel = await j.locator('form:has(button:has-text("All verified"))').innerText();
  check(panel.includes('ENGL C1000') && panel.includes('COMM C1000'), 'Clear units shows the added class with the others');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
