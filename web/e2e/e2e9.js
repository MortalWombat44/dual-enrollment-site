const { chromium } = require('playwright');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 900 } };
async function tryLogin(p, email, pw) {
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForNavigation(), p.click('button:has-text("Sign in")')]);
}

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext(desk)).newPage();

  // Lockout after 5 wrong passwords.
  for (let i = 1; i <= 4; i++) {
    await tryLogin(p, 'maya.r@student.suhsd.net', 'wrong-' + i);
    check(await seen(p, 'text=After 5 wrong tries the account locks'), `wrong try ${i}: warning shown`);
  }
  await tryLogin(p, 'maya.r@student.suhsd.net', 'wrong-5');
  check(await seen(p, 'text=This account is locked for 15 more minutes'), '5th wrong try locks the account');
  await tryLogin(p, 'maya.r@student.suhsd.net', 'shasta2027');
  check(await seen(p, 'text=Too many wrong passwords'), 'even the right password is refused while locked');
  await p.screenshot({ path: OUT + '/g1-locked.png', fullPage: true });

  // Unknown emails behave the same (no account enumeration).
  await tryLogin(p, 'nobody@example.org', 'whatever');
  check(await seen(p, 'text=After 5 wrong tries the account locks'), 'unknown email gets the same message');

  // Super admin sees Locked, can unlock.
  const a = await (await b.newContext(desk)).newPage();
  await tryLogin(a, 'dortiz@shastacollege.edu', 'shasta2027');
  await a.goto(B + '/admin/users?q=Maya');
  check(await seen(a, 'tr:has-text("Maya Rivera") >> text=Locked'), 'super admin sees Locked');
  await Promise.all([a.waitForURL(/unlocked=1/), a.click('tr:has-text("Maya Rivera") button:has-text("Unlock")')]);
  await tryLogin(p, 'maya.r@student.suhsd.net', 'shasta2027');
  check(p.url().endsWith('/student'), 'unlocked user can sign in');

  // Forgot password (test mode shows the link).
  const f = await (await b.newContext(desk)).newPage();
  await f.goto(B + '/login');
  await f.click('a:has-text("Forgot password?")');
  await f.fill('#email', 'ethan.b@student.suhsd.net');
  await Promise.all([f.waitForURL(/sent=1/), f.click('button:has-text("Send reset link")')]);
  check(await seen(f, "text=If there's an account with that email"), 'neutral confirmation shown');
  const link = await f.locator('a[href*="/reset/"]').getAttribute('href');
  check(!!link, 'test-mode link shown');
  await f.screenshot({ path: OUT + '/g2-forgot.png', fullPage: true });
  // Unknown email: same message, no link.
  await f.goto(B + '/forgot'); await f.fill('#email', 'nobody@example.org');
  await Promise.all([f.waitForURL(/sent=1/), f.click('button:has-text("Send reset link")')]);
  check(await seen(f, "text=If there's an account with that email") && (await f.locator('a[href*="/reset/"]').count()) === 0, 'unknown email: same message, nothing sent');

  // Ethan is signed in elsewhere; resetting signs that session out.
  const ethanOld = await (await b.newContext(desk)).newPage();
  await tryLogin(ethanOld, 'ethan.b@student.suhsd.net', 'shasta2027');
  await f.goto(link);
  check(await seen(f, 'text=Set a new password, Ethan.'), 'reset page opens');
  await f.fill('#pw', 'ethanNew2027'); await f.fill('#pw2', 'different99');
  await Promise.all([f.waitForURL(/error=1/), f.click('button:has-text("Save new password")')]);
  check(await seen(f, 'text=must match'), 'mismatched passwords rejected');
  await f.fill('#pw', 'ethanNew2027'); await f.fill('#pw2', 'ethanNew2027');
  await Promise.all([f.waitForURL(/reset=1/), f.click('button:has-text("Save new password")')]);
  check(await seen(f, 'text=Your password was changed'), 'password changed');
  await ethanOld.goto(B + '/student');
  check(ethanOld.url().includes('/login'), 'old session signed out');
  await tryLogin(f, 'ethan.b@student.suhsd.net', 'shasta2027');
  check(await seen(f, "text=don't match"), 'old password no longer works');
  await tryLogin(f, 'ethan.b@student.suhsd.net', 'ethanNew2027');
  check(f.url().endsWith('/student'), 'new password works');
  await f.goto(B + link.replace(/^https?:\/\/[^/]+/, ''));
  check(f.url().includes('/forgot?error=expired'), 'reset link only works once');

  // Super admin reset link.
  await a.goto(B + '/admin/users?q=Sofia');
  await Promise.all([a.waitForURL(/resetfor=/), a.click('tr:has-text("Sofia Nguyen") button:has-text("Reset link")')]);
  check(await seen(a, 'text=Password reset link for Sofia Nguyen'), 'super admin can make a reset link');

  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
