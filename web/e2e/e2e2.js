const { addCe } = require('./testlib');
const { chromium, devices } = require('playwright');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const seen = (p, sel) => p.waitForSelector(sel, { timeout: 8000 }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
async function login(b, email, opts, pw = 'shasta2027') {
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
(async () => {
  const b = await chromium.launch();
  const desk = { viewport: { width: 1280, height: 900 } };

  // Maya shares by default in the demo data -> Laura sees everything.
  let laura = await login(b, 'laura.rivera@gmail.com', desk);
  check(await seen(laura, 'text=3 of 6 steps'), 'shared: parent sees full progress');

  // Maya turns sharing off.
  let maya = await login(b, 'maya.r@student.suhsd.net', desk);
  await maya.click('nav >> text=Account').catch(() => maya.goto(B + '/student/account'));
  await maya.goto(B + '/student/account');
  check(await seen(maya, 'text=Laura Rivera'), 'account page lists linked parent');
  await maya.locator('label:has-text("Let my parent")').click();
  await Promise.all([maya.waitForURL(/saved=off/), maya.click('form:has(input[name="share"]) button')]);
  check(await seen(maya, 'text=now private'), 'sharing turned off');
  await laura.reload();
  check(await seen(laura, 'text=is private.'), 'unshared: parent sees private notice');
  check(!(await laura.isVisible('text=3 of 6 steps')), 'unshared: no step data');
  const mayaId = await maya.evaluate(() => 0);
  const r1 = await laura.request.get(B + '/student/steps/3');
  check(!r1.url().includes('/student/steps'), 'parent cannot open student pages');

  // Jamie: step 01, then invites a parent. Course selection stays locked until consent.
  const jamie = await login(b, 'jamie.l@student.andersonhigh.org', desk);
  await jamie.goto(B + '/student/steps/1'); await jamie.fill('#sid', 'S18234567');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Save my ID")')]);
  await jamie.goto(B + '/student/steps/2');
  check(await seen(jamie, 'text=Finish step 02, parent consent, first.') && (await jamie.locator('input[name="course"]').count()) === 0, 'course selection locked until parent consent');
  await jamie.goto(B + '/student');
  check(await seen(jamie, 'a:has-text("Invite parent")'), 'dashboard says Invite parent');
  await jamie.click('a:has-text("Invite parent")');
  await jamie.fill('#pfirst', 'Jamie'); await jamie.fill('#plast', 'Lee'); await jamie.fill('#pemail', 'jamie.l@student.andersonhigh.org');
  await Promise.all([jamie.waitForURL(/invite_error=self/), jamie.click('button:has-text("Create invite link")')]);
  check(await seen(jamie, "text=That's your own email"), 'rejects own email');
  await jamie.fill('#pfirst', 'Chris'); await jamie.fill('#plast', 'Lee'); await jamie.fill('#pemail', 'chris.lee@example.com');
  await Promise.all([jamie.waitForURL(/invited=/), jamie.click('button:has-text("Create invite link")')]);
  check(await seen(jamie, 'text=Invite ready'), 'invite link shown');
  check(await seen(jamie, 'a:has-text("Send by text")'), 'text button present');
  await jamie.screenshot({ path: OUT + '/n1-student-invites-parent.png', fullPage: true });
  const link = (await jamie.locator('code').first().innerText()).trim();
  check(link.includes('/invite/'), 'link looks right');

  // Parent opens the link on a phone.
  const pctx = await b.newContext({ ...devices['iPhone 13'] });
  const par = await pctx.newPage(); par.errs = []; par.on('pageerror', (e) => par.errs.push(e.message));
  await par.goto(link);
  check(await seen(par, 'text=Jamie invited you'), 'invite page names the student');
  await par.screenshot({ path: OUT + '/n2-parent-invite-page.png', fullPage: true });
  await par.fill('#pw', 'parentpass1'); await par.fill('#pw2', 'parentpass1');
  await Promise.all([par.waitForURL(/\/parent/), par.click('button:has-text("Set password")')]);
  check(await seen(par, 'text=is private.'), 'new parent: private view by default');
  check(await seen(par, 'a:has-text("Review & sign")'), 'new parent: can still sign');
  await par.screenshot({ path: OUT + '/n3-parent-private-view.png', fullPage: true });
  await par.click('a:has-text("Review & sign")');
  await par.waitForURL(/parent\/consent/);
  check(await seen(par, 'text=After you sign, Jamie picks Shasta College classes'), 'consent is generic (no classes listed)');
  const box = await par.locator('.sigpad canvas').boundingBox();
  const cdp = await pctx.newCDPSession(par);
  const pts = []; for (let i = 0; i <= 30; i++) pts.push({ x: box.x + 30 + i * ((box.width - 60) / 30), y: box.y + 100 + Math.sin(i / 3) * 30 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
  for (const pt of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await par.locator('label:has-text("legal guardian")').click();
  await Promise.all([par.waitForURL(/signed=/), par.click('button:has-text("Submit consent")')]);
  check(await seen(par, 'text=Your consent for Jamie is in'), 'consent submitted');
  check(await seen(par, 'a:has-text("View the consent you signed")'), 'can view own signed consent');
  await par.click('a:has-text("View the consent you signed")');
  const img = par.locator('img[alt^="Signature"]');
  await img.waitFor({ timeout: 8000 });
  check(await img.evaluate((el) => el.complete && el.naturalWidth > 0), 'own signature image loads while unshared');

  // Jamie sees consent done + parent as account; turns sharing on.
  await jamie.goto(B + '/student');
  check(await seen(jamie, 'text=Step 02 complete.'), 'student sees consent complete');
  await jamie.goto(B + '/student/steps/2');
  await addCe(jamie, 'ENGL C1000', 3); await addCe(jamie, 'COMM C1000', 3);
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Submit courses")')]);
  check(true, 'courses unlocked after consent');
  await jamie.goto(B + '/student/account');
  await jamie.locator('label:has-text("Let my parent")').click();
  await Promise.all([jamie.waitForURL(/saved=on/), jamie.click('form:has(input[name="share"]) button')]);
  await jamie.screenshot({ path: OUT + '/n4-student-account-sharing.png', fullPage: true });
  await par.goto(B + '/parent');
  check(await seen(par, 'text=3 of 5 steps'), 'after sharing: parent sees full progress');

  // Admin can no longer create parents.
  const admin = await login(b, 'dortiz@shastacollege.edu', desk);
  await admin.goto(B + '/admin/users?add=1');
  check(await seen(admin, '.modal label:has-text("High School Staff")'), 'add user dialog open');
  check((await admin.locator('.modal label:has-text("Parent")').count()) === 0, 'no Parent role for admins');

  for (const p of [laura, maya, jamie, par, admin]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
