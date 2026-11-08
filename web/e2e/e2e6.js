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
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
const pick = async (p, name) => {
  const href = await p.locator(`a.rowa:has-text("${name}")`).first().getAttribute('href');
  await p.goto(B + href);
  await p.waitForSelector(`.admin div:has-text("${name}")`);
};

(async () => {
  const b = await chromium.launch();

  // Student signs up, picks a high school, enters an ID that's already Maya's.
  const ctx = await b.newContext(desk); const riley = await ctx.newPage();
  riley.errs = []; riley.on('pageerror', (e) => riley.errs.push(e.message));
  await riley.goto(B + '/login');
  await riley.click('a:has-text("Create your account")');
  await riley.fill('#first', 'Riley'); await riley.fill('#last', 'Chen'); await riley.fill('#email', 'riley.c@student.example.org');
  await riley.selectOption('#school', { label: 'Foothill High School · Shasta Union HSD' });
  await riley.fill('#sid', '0412893');
  await riley.selectOption('#grad', '2028'); await riley.selectOption('#grade', '11');
  await riley.fill('#pw', 'rileypass1'); await riley.fill('#pw2', 'rileypass1');
  await riley.screenshot({ path: OUT + '/d1-signup.png', fullPage: true });
  await fillProfile(riley);
  await Promise.all([riley.waitForURL(/\/student$/), riley.click('button:has-text("Create account")')]);
  check(await seen(riley, 'text=Foothill High School'), 'new student signed up at Foothill');

  // Steps 1–2 with classes in two terms.
  await riley.goto(B + '/student/steps/1'); // Riley's ID from sign-up is already filled in.
  await Promise.all([riley.waitForURL(/complete/), riley.click('button:has-text("Save my ID")')]);
  grantConsent('riley.c@student.example.org');
  await riley.goto(B + '/student/steps/2');
  check(await seen(riley, 'text=Spring 2027: 0 of 15 units') && await seen(riley, 'text=Summer 2027: 0 of 15 units'), 'unit counters per term');
  await addCe(riley, 'ENGL C1000', 3);
  await addCe(riley, 'COMM C1000', 3, 'Summer 2027');
  check(await seen(riley, 'text=Spring 2027: 3 of 15 units') && await seen(riley, 'text=Summer 2027: 3 of 15 units'), 'units split by term');
  await riley.screenshot({ path: OUT + '/d2-course-terms.png', fullPage: true });
  await Promise.all([riley.waitForURL(/complete/), riley.click('button:has-text("Submit courses")')]);
  await riley.goto(B + '/student');
  check(await seen(riley, 'text=Spring 2027 + Summer 2027 · Foothill High School'), 'dashboard shows both terms');

  // Riley asks to change high school.
  await riley.goto(B + '/student/account');
  await riley.click('summary:has-text("Request a high school change")');
  await riley.selectOption('details #school', { label: 'Shasta High School · Shasta Union HSD' });
  await riley.fill('#snote', 'I moved.');
  await Promise.all([riley.waitForURL(/saved=school_request/), riley.click('button:has-text("Send request to college staff")')]);
  check(await seen(riley, 'text=Waiting for them to update it'), 'student sees pending school change');

  // College admin: shared IDs + school changes.
  const jordan = await login(b, 'jkim@shastacollege.edu');
  await jordan.click('a.seg-opt:has-text("Shared IDs")');
  check(await seen(jordan, 'text=Shared IDs · 4'), 'two shared-ID pairs flagged (seeded + Riley/Maya)');
  await pick(jordan, 'Riley Chen');
  check(await seen(jordan, 'text=is also on: Maya Rivera'), 'panel names the other account');
  await jordan.screenshot({ path: OUT + '/d3-shared-id.png', fullPage: true });
  await jordan.fill('input[aria-label="Shasta College ID"]', '0413999');
  await Promise.all([jordan.waitForURL(/done=id_saved/), jordan.click('button:has-text("Save ID")')]);
  await jordan.goto(B + '/admin/students?tab=ids');
  check(await seen(jordan, 'text=Shared IDs · 2'), 'fixing the ID clears the flag');
  await jordan.goto(B + '/admin/students?tab=school');
  check(await seen(jordan, 'text=School changes · 2'), 'school change queue: Ava (seeded) + Riley');
  await pick(jordan, 'Riley Chen');
  await Promise.all([jordan.waitForURL(/school_change_approved/), jordan.click('button:has-text("Move to Shasta HS")')]);
  await riley.goto(B + '/student/account');
  check(await seen(riley, 'div:text-is("Shasta High School")'), 'student now at Shasta High School');

  // Super admin turns Summer registration off.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  await tab.goto(B + '/admin/terms');
  check(await seen(tab, 'text=Registration allowed'), 'Terms page has Registration allowed');
  const summer = tab.locator('form:has(input[value="Summer 2027"])');
  await summer.locator('input[name="active"]').uncheck();
  await Promise.all([tab.waitForURL(/saved=/), summer.locator('button:has-text("Save")').click()]);
  // Riley hadn't registered for Summer: that request is archived, and Course selection says why.
  await riley.goto(B + '/student/steps/2');
  check(await seen(riley, 'text=Registration was turned off for Summer 2027'), 'student told the Summer request was closed');
  await riley.screenshot({ path: OUT + '/d4-student-closed-term.png', fullPage: true });
  const jamie = await login(b, 'jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/1'); await jamie.fill('#sid', 'S18231111');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Save my ID")')]);
  grantConsent('jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/2');
  check(!(await jamie.isVisible('text=Summer 2027: 0 of 15 units')), 'closed term not offered for new requests');

  // Admin clearing units sees the term + closed flag.
  await jordan.goto(B + '/admin/students');
  await pick(jordan, 'Ethan Brooks');
  await jordan.locator('form:has(input[name="courseId"]) >> nth=0').locator('select[name="termId"]').selectOption({ label: 'Summer 2027 (closed)' });
  await Promise.all([jordan.waitForURL(/done=course_term/), jordan.locator('form:has(input[name="courseId"]) >> nth=0').locator('button:has-text("Save")').click()]);
  // Enterprise is Non-CCAP: a class moved to a new term needs high school approval again. Mark it done as an admin.
  await Promise.all([jordan.waitForURL(/done=moved/), jordan.locator('form:has(input[name="stepId"][value="4"]) button:has-text("Mark complete")').click()]);
  check(await seen(jordan, 'text=Registration closed'), 'clear-units panel flags closed term');
  check(await seen(jordan, 'span:text-is("Summer 2027")'), 'clear-units panel groups by term');
  await jordan.screenshot({ path: OUT + '/d5-clear-units-terms.png', fullPage: true });

  // Parent consent is one-time: moving back Course selection keeps it.
  await jordan.goto(B + '/admin/students?tab=all');
  await pick(jordan, 'Maya Rivera');
  await jordan.locator('form:has(input[name="stepId"][value="2"]) button:has-text("Move back")').click();
  await jordan.waitForURL(/done=reopened/);
  const consentRow = await jordan.locator('form:has(input[name="stepId"][value="3"])').innerText();
  check(/Parent consent · ✓/.test(consentRow) && /Move back/.test(consentRow), 'consent stays on file after reopening Course selection');
  const laura = await login(b, 'laura.rivera@gmail.com');
  check(await seen(laura, 'text=It\'s a one-time consent that covers this and future terms'), 'parent sees one-time consent note');
  check(await seen(laura, 'text=[email address coming soon]'), 'revoke email placeholder shown');
  await laura.screenshot({ path: OUT + '/d6-parent-revoke-note.png', fullPage: true });

  for (const p of [riley, jordan, tab, jamie]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
