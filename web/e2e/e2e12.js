const { fillProfile } = require('./testlib');
const { chromium } = require('playwright');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 900 } };
async function signIn(p, email, pw = 'shasta2027') {
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
}
async function login(b, email, pw) {
  const p = await (await b.newContext(desk)).newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await signIn(p, email, pw); return p;
}

(async () => {
  const b = await chromium.launch();

  // New student skips the ID.
  const z = await (await b.newContext(desk)).newPage();
  await z.goto(B + '/signup');
  await z.fill('#first', 'Zed'); await z.fill('#last', 'Ford'); await z.fill('#email', 'zed.f@student.example.org');
  await z.selectOption('#school', { label: 'Enterprise High School · Shasta Union HSD' });
  await z.selectOption('#grade', '11'); await z.selectOption('#grad', '2028');
  await z.fill('#pw', 'zedpass111'); await z.fill('#pw2', 'zedpass111');
  await fillProfile(z);
  await Promise.all([z.waitForURL(/\/student$/), z.click('button:has-text("Create account")')]);
  await z.goto(B + '/student/steps/1');
  check(await seen(z, 'label:has-text("Shasta College ID")'), 'step 01 asks for the Shasta College ID');
  check(await seen(z, 'text=You only do this step once'), 'step says it is once-ever');
  await z.click('label:has-text("don\'t have my Shasta College ID yet")');
  check(await seen(z, "text=you'll come back to this step each time you sign in"), 'skip warning shown');
  await z.screenshot({ path: OUT + '/j1-skip-id.png', fullPage: true });
  await Promise.all([z.waitForURL(/steps\/1\/complete/), z.click('button:has-text("Skip for now")')]);
  await z.goto(B + '/student');
  check(await seen(z, 'text=Add your Shasta College ID.'), 'dashboard reminds about the ID');
  check(await seen(z, '[href="/student/steps/3"] >> text=Invite your parent'), 'can continue to parent consent');
  // Sign out and back in: returned to step 01.
  await z.context().clearCookies();
  await signIn(z, 'zed.f@student.example.org', 'zedpass111');
  check(z.url().endsWith('/student/steps/1'), 'returned to step 01 at sign-in');
  await z.fill('#sid', 'S0419999');
  await Promise.all([z.waitForURL(/id_added=1/), z.click('button:has-text("Save my ID")')]);
  check(await seen(z, 'text=Your Shasta College ID is saved') && !(await z.isVisible('text=Add your Shasta College ID.')), 'ID added, reminder gone');
  await z.context().clearCookies();
  await signIn(z, 'zed.f@student.example.org', 'zedpass111');
  check(z.url().endsWith('/student'), 'no longer returned to step 01');

  // Once ever: moving a student back to Course selection keeps step 01 (and consent).
  const jordan = await login(b, 'jkim@shastacollege.edu');
  await jordan.goto(B + '/admin/students?tab=all&q=Maya');
  await jordan.click('a.rowa:has-text("Maya Rivera")');
  await jordan.locator('form:has(input[name="stepId"][value="2"]) button:has-text("Move back")').click();
  await jordan.waitForURL(/done=reopened/);
  const s1 = await jordan.locator('form:has(input[name="stepId"][value="1"])').innerText();
  check(/CCCApply · ✓/.test(s1), 'step 01 stays done after moving back');

  // High school staff: grade + grad year, and ID change request.
  const rosa = await login(b, 'ralvarez@suhsd.net');
  await rosa.goto(B + '/counselor?tab=incomplete');
  await rosa.click('a.rowa:has-text("Noah Patel")');
  await rosa.selectOption('select[name="grade"]', '12'); await rosa.fill('input[name="grad_year"]', '2027');
  await Promise.all([rosa.waitForURL(/done=grade/), rosa.click('form:has(select[name="grade"]) button:has-text("Save")')]);
  check(await seen(rosa, 'text=Grade and graduation year saved'), 'staff updated grade + grad year');
  check(await seen(rosa, 'text=Class of 2027 · 12th grade'), 'shows the new grade');
  await rosa.click('summary:has-text("Request a Shasta College ID change")');
  await rosa.fill('input[name="new_number"]', '0419876'); await rosa.fill('input[name="note"]', 'Typo in the original');
  await Promise.all([rosa.waitForURL(/done=id_request/), rosa.click('button:has-text("Send request to Shasta College")')]);
  check(await seen(rosa, 'text=Waiting for Shasta College to approve it'), 'request pending for staff');
  await rosa.screenshot({ path: OUT + '/j2-staff-panel.png', fullPage: true });
  await jordan.goto(B + '/admin/students?tab=idreq');
  check(await seen(jordan, 'text=ID changes · 1'), 'admin sees ID change queue');
  await jordan.click('a.rowa:has-text("Noah Patel")');
  await Promise.all([jordan.waitForURL(/id_change_approved/), jordan.click('button:has-text("Change ID to 0419876")')]);
  check(await seen(jordan, 'text=ID 0419876'), 'ID changed by admin');

  for (const p of [jordan, rosa]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
