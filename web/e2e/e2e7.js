const { chromium } = require('playwright');
const { grantConsent, addCe, fillProfile } = require('./testlib');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
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

  // CCAP student (Anderson HS): 15 per term.
  const jamie = await login(b, 'jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/1'); await jamie.fill('#sid', 'S18231111');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Save my ID")')]);
  grantConsent('jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/2');
  check(await seen(jamie, 'text=Spring 2027: 0 of 15 units') && await seen(jamie, 'text=Summer 2027: 0 of 15 units'), 'CCAP: 15-unit limit, summer too');

  // Non-CCAP student signs up at University Prep: 11, summer 7.
  const ctx = await b.newContext(desk); const s = await ctx.newPage();
  await s.goto(B + '/signup');
  await s.fill('#first', 'Quinn'); await s.fill('#last', 'Ray'); await s.fill('#email', 'quinn.r@student.example.org');
  await s.selectOption('#school', { label: 'University Preparatory · Redding School District' });
  await s.selectOption('#grad', '2028'); await s.selectOption('#grade', '11');
  await s.fill('#pw', 'quinnpass1'); await s.fill('#pw2', 'quinnpass1');
  await fillProfile(s);
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/steps/1'); await s.fill('#sid', 'S18232222');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent('quinn.r@student.example.org');
  await s.goto(B + '/student/steps/2');
  check(await seen(s, 'text=Spring 2027: 0 of 11 units') && await seen(s, 'text=Summer 2027: 0 of 7 units'), 'non-CCAP: 11, summer 7');
  for (const c of ['ENGL C1000', 'COMM C1000', 'PSYC C1000']) {
    await addCe(s, c, 3, 'Summer 2027');
  }
  check(await seen(s, 'text=over the usual 7-unit limit for non-CCAP students'), 'over-limit note shown (not blocked)');
  await s.screenshot({ path: OUT + '/e1-over-limit-note.png', fullPage: true });
  await Promise.all([s.waitForURL(/steps\/2\/complete/), s.click('button:has-text("Submit courses")')]);
  check(true, 'submitting over the limit is allowed');
  await s.goto(B + '/student/steps/4');
  check(await seen(s, 'text=Over the usual 7-unit limit for non-CCAP students in summer'), 'note carried into the workflow');

  // Terms page summer flag.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  await tab.goto(B + '/admin/terms');
  check(await tab.locator('form:has(input[value="Summer 2027"]) input[name="summer"]').isChecked(), 'Summer 2027 flagged as summer');
  check(!(await tab.locator('form:has(input[value="Spring 2027"]) input[name="summer"]').isChecked()), 'Spring 2027 not summer');

  // Disable / enable an account.
  const maya = await login(b, 'maya.r@student.suhsd.net');
  await tab.goto(B + '/admin/users?q=Maya');
  check(!(await tab.isVisible('tr:has-text("Tabitha Miller") button:has-text("Disable")')), 'no Disable button on yourself');
  await Promise.all([tab.waitForURL(/disabled=/), tab.click('tr:has-text("Maya Rivera") button:has-text("Disable")')]);
  check(await seen(tab, 'tr:has-text("Maya Rivera") >> text=Disabled'), 'Maya shown as Disabled');
  await tab.screenshot({ path: OUT + '/e2-disabled-user.png', fullPage: true });
  await maya.goto(B + '/student');
  check(maya.url().includes('/login'), 'disabled user is signed out');
  await maya.fill('#email', 'maya.r@student.suhsd.net'); await maya.fill('#password', 'shasta2027');
  await Promise.all([maya.waitForURL(/error=disabled/), maya.click('button:has-text("Sign in")')]);
  check(await seen(maya, 'text=This account has been disabled'), 'disabled user sees message at sign-in');
  await Promise.all([tab.waitForURL(/enabled=/), tab.click('tr:has-text("Maya Rivera") button:has-text("Enable")')]);
  await maya.fill('#password', 'shasta2027');
  await Promise.all([maya.waitForURL(/\/student/), maya.click('button:has-text("Sign in")')]);
  check(true, 're-enabled user can sign in');

  for (const p of [jamie, s, tab, maya]) if (p.errs && p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
