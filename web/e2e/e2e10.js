const { fillProfile } = require('./testlib');
const { chromium } = require('playwright');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 900 } };
async function login(b, email, pw = 'shasta2027') {
  const ctx = await b.newContext(desk); const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const mode = process.argv[2];

  if (mode === 'nudge') {
    // Server started with DE_TODAY=2027-06-10: class of 2023 is "4 years ago".
    const tab = await login(b, 'dortiz@shastacollege.edu');
    check(await seen(tab, "text=It's June:") && await seen(tab, 'text=from the class of 2023 or earlier'), 'June nudge shown to super admin');
    await tab.screenshot({ path: OUT + '/h4-june-nudge.png', fullPage: true });
    const jordan = await login(b, 'jkim@shastacollege.edu');
    check(!(await jordan.isVisible("text=It's June:")), 'college admins do not get the nudge');
    await Promise.all([tab.waitForURL(/admin\/users/), tab.click('button:has-text("Dismiss for this year")')]);
    check(!(await tab.isVisible("text=It's June:")), 'nudge dismissed for the year');
    await b.close(); console.log('ALL PASSED'); return;
  }

  // Roster for Jordan (primary: Enterprise HS).
  const jordan = await login(b, 'jkim@shastacollege.edu');
  await jordan.click('.admin-nav >> text=Roster');
  check(await seen(jordan, 'h1:has-text("Enterprise High School")'), 'roster opens on primary school');
  const engl = jordan.locator('[data-class]:has-text("ENGL C1000")');
  check(await engl.locator('text=Maya Rivera').count() === 1 && await engl.locator('text=Lucas Hart').count() === 1, 'DE section lists who selected it');
  check(await engl.locator('text=Period TBD · Teacher TBD').count() === 1, 'section shows period and teacher (TBD)');
  check(await seen(jordan, '[data-class]:has-text("Maya Rivera") >> text=04 High school approval'), 'shows the step each student is on');
  await jordan.screenshot({ path: OUT + '/h1-roster-class.png', fullPage: true });
  await jordan.click('a.seg-opt:has-text("By teacher")');
  check(await seen(jordan, 'h2:has-text("TBD")') && await seen(jordan, 'h2:has-text("Shasta College (Concurrent Enrollment)")'), 'by-teacher view groups by teacher');
  await jordan.screenshot({ path: OUT + '/h2-roster-teacher.png', fullPage: true });
  const csv = await jordan.request.get(B + '/admin/roster.csv?school=2');
  const text = await csv.text();
  check(csv.status() === 200 && text.includes('"Maya Rivera"') && text.includes('"ENGL C1000"'), 'CSV export works');

  // GPA gone; class of shown.
  await jordan.goto(B + '/admin/students?tab=all');
  await jordan.click('a.rowa:has-text("Maya Rivera")');
  check(await seen(jordan, 'text=Class of 2028 · 11th grade') && !(await jordan.isVisible('text=GPA')), 'class of shown, GPA removed');

  // Sign-up requires grad year.
  const s = await (await b.newContext(desk)).newPage();
  await s.goto(B + '/signup');
  check((await s.locator('#grad option').allInnerTexts()).filter((x) => x.startsWith('Class of')).join(',') === 'Class of 2027,Class of 2028,Class of 2029,Class of 2030,Class of 2031,Class of 2032,Class of 2033,Class of 2034,Class of 2035,Class of 2036,Class of 2037,Class of 2038,Class of 2039', 'grad year choices 2027–2039');
  await s.fill('#first', 'Zoe'); await s.fill('#last', 'Bell'); await s.fill('#email', 'zoe.b@student.example.org');
  await s.selectOption('#school', { label: 'Enterprise High School · Shasta Union HSD' });
  await s.selectOption('#grad', '2029');
  await s.selectOption('#grade', '10');
  await s.fill('#pw', 'zoepass11'); await s.fill('#pw2', 'zoepass11');
  await s.screenshot({ path: OUT + '/h3-signup-grad.png', fullPage: true });
  await fillProfile(s);
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/account');
  check(await seen(s, 'text=Class of 2029 · 10th grade'), 'student account shows class of');

  // Retire a graduated class.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  await tab.goto(B + '/admin/users#retire');
  check(await seen(tab, 'button:has-text("Retire class of 2022")') && await seen(tab, 'button:has-text("Retire class of 2023")'), 'graduated classes listed');
  check(!(await tab.isVisible('button:has-text("Retire class of 2027")')), 'current students cannot be retired');
  await Promise.all([tab.waitForURL(/retired=2022/), tab.click('button:has-text("Retire class of 2022")')]);
  check(await seen(tab, 'text=Retired the class of 2022: 2 student accounts'), 'class retired');
  await tab.goto(B + '/admin/users?q=Holt');
  check(await seen(tab, 'tr:has-text("Grace Holt") >> text=Retired'), 'retired tag shown');
  const grace = await (await b.newContext(desk)).newPage();
  await grace.goto(B + '/login'); await grace.fill('#email', 'grace.holt@alumni.example.org'); await grace.fill('#password', 'shasta2027');
  await Promise.all([grace.waitForURL(/error=/), grace.click('button:has-text("Sign in")')]);
  check(await seen(grace, 'text=This account has been disabled'), 'retired student cannot sign in');
  check(!(await tab.isVisible("text=It's June:")), 'no June nudge in November');

  for (const p of [jordan, tab]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
