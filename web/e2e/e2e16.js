// CCAP: "cleared for the maximum units" keeps the student out of the Clear units queue for that term.
const clearUnits = require('./testlib').clearUnits;
const { chromium } = require('playwright');
const { grantConsent, addCe } = require('./testlib');
const B = 'http://localhost:3100';
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext(desk)).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
const inQueue = async (j, name) => { await j.goto(B + '/admin/students'); return (await j.locator('a.rowa', { hasText: name }).count()) > 0; };
async function changeClasses(s, fn) {
  await s.goto(B + '/student/steps/2');
  await s.click('button:has-text("Change or remove classes")');
  await s.waitForSelector('button:has-text("Submit courses")');
  await fn();
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);
}

(async () => {
  const b = await chromium.launch();
  const s = await login(b, 'jamie.l@student.andersonhigh.org'); // Anderson HS = CCAP
  await s.goto(B + '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent('jamie.l@student.andersonhigh.org');
  await s.goto(B + '/student/steps/2');
  await s.click('[data-kind="de"] label:has-text("PSYC C1000")');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);

  const j = await login(b, 'jkim@shastacollege.edu');
  check(await inQueue(j, 'Jamie Lee'), 'CCAP student in Clear units queue');
  await Promise.all([j.waitForURL(/student=/), j.locator('a.rowa', { hasText: 'Jamie Lee' }).click()]);
  check(await j.locator('input[name="max_units"]').count() === 1, 'max-units box offered for CCAP student');
  await j.locator('input[name="max_units"]').check();
  await Promise.all([j.waitForURL(/done=cleared/), clearUnits(j)]);

  await changeClasses(s, async () => { await addCe(s, 'HIST C1010', 3); });
  check(!(await inQueue(j, 'Jamie Lee')), 'added a Spring class: not back in the Clear units queue');
  await s.goto(B + '/student');
  check(!/maximum units/i.test(await s.content()), 'student is not told about the max-units clearance');
  await changeClasses(s, async () => { await addCe(s, 'COMM C1000', 3, 'Summer 2027'); });
  check(await inQueue(j, 'Jamie Lee'), 'Summer class (not cleared) puts them back in the queue');

  await j.goto(B + '/admin/students?tab=all');
  await Promise.all([j.waitForURL(/student=/), j.locator('a.rowa', { hasText: 'Ethan Brooks' }).click()]);
  check(await j.locator('input[name="max_units"]').count() === 0, 'no max-units box for a Non-CCAP student');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
