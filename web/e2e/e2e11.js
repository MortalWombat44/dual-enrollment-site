const { fillProfile } = require('./testlib');
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 900 } };
async function login(b, email, pw = 'shasta2027') {
  const ctx = await b.newContext(desk); const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}

(async () => {
  const b = await chromium.launch();

  // A 6th grader signs up.
  const s = await (await b.newContext(desk)).newPage();
  await s.goto(B + '/signup');
  check((await s.locator('#grade option').allInnerTexts()).includes('1st grade'), 'grade list goes down to 1st grade');
  await s.fill('#first', 'Milo'); await s.fill('#last', 'Young'); await s.fill('#email', 'milo.y@student.example.org');
  await s.selectOption('#school', { label: 'Enterprise High School · Shasta Union HSD' });
  await s.selectOption('#grade', '6'); await s.selectOption('#grad', '2033');
  await s.fill('#pw', 'milopass11'); await s.fill('#pw2', 'milopass11');
  await fillProfile(s);
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/account');
  check(await seen(s, 'text=Class of 2033 · 6th grade'), 'student shows 6th grade');

  const tab = await login(b, 'dortiz@shastacollege.edu');
  await tab.goto(B + '/admin/students?tab=all&q=Milo');
  check(await seen(tab, 'tr:has-text("Milo Young") >> text=Young student'), 'young student tagged in admin list');
  await tab.screenshot({ path: OUT + '/i2-young-tag.png', fullPage: true });

  // New school year: Milo's confirmation is from last year, so he's asked again.
  const db = new DatabaseSync(DB);
  db.prepare("UPDATE users SET grade_confirmed_year = grade_confirmed_year - 1 WHERE email = 'milo.y@student.example.org'").run();
  await s.goto(B + '/student');
  check(s.url().endsWith('/confirm-grade'), 'first visit of the new year goes to confirm page');
  await s.goto(B + '/student/steps/1');
  check(s.url().endsWith('/confirm-grade'), 'every student page is gated until confirmed');
  check(await seen(s, 'text=Welcome back, Milo.'), 'confirm page shown');
  await s.screenshot({ path: OUT + '/i1-confirm-grade.png', fullPage: true });
  await s.selectOption('#grade', '9'); await s.selectOption('#grad', '2030');
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Confirm and continue")')]);
  check(true, 'confirmed and continued');
  await s.goto(B + '/student');
  check(s.url().endsWith('/student'), 'not asked again this year');
  await tab.reload();
  check(!(await tab.isVisible('tr:has-text("Milo Young") >> text=Young student')), 'tag drops off at 9th grade');

  // Existing students aren't prompted this school year.
  const maya = await login(b, 'maya.r@student.suhsd.net');
  check(maya.url().endsWith('/student'), 'already-confirmed student goes straight in');

  for (const p of [tab, maya]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
