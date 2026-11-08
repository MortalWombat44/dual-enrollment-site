const { chromium } = require('playwright');
const clearUnits = require('./testlib').clearUnits;
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 900 } };
async function login(b, email) {
  const ctx = await b.newContext(desk); const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', 'shasta2027');
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
const pick = async (p, name) => {
  const href = await p.locator(`a.rowa:has-text("${name}")`).first().getAttribute('href');
  await p.goto(B + href);
  await p.waitForSelector(`.admin div:has-text("${name}")`);
};
const panel = (p) => p.locator('.admin > div:last-child').innerText();
const tab = async (p, label) => { await p.click(`a.seg-opt:has-text("${label}")`); await p.waitForLoadState('networkidle'); };

(async () => {
  const b = await chromium.launch();

  const maya = await login(b, 'maya.r@student.suhsd.net');
  check(await seen(maya, 'text=3 of 6 steps'), 'Maya: 3 of 6 done');
  check(await seen(maya, 'text=Up next · Step 04'), 'Maya: step 04 is next');
  check(await seen(maya, '.kicker + div:has-text("High school approval")'), 'step 04 is High school approval');

  const rosa = await login(b, 'ralvarez@suhsd.net');
  check(await seen(rosa, 'text=Ready to review · 3'), 'counselor has 3 waiting (before Clear units)');
  await rosa.click('a:has-text("Lucas Hart")');
  await Promise.all([rosa.waitForURL(/done=approved/), (async () => { await rosa.click('label.seg-opt:has-text("Type")'); await rosa.waitForSelector('button:has-text("Approve & sign digitally"):not([disabled])'); await rosa.click('button:has-text("Approve & sign digitally")'); })()]);
  check(await seen(rosa, 'text=Shasta College clears their units next'), 'counselor told units are next');

  const jordan = await login(b, 'jkim@shastacollege.edu');
  check(await seen(jordan, 'text=College review · 3'), 'clear units queue: Ethan, Sofia + Lucas just approved');
  await jordan.screenshot({ path: OUT + '/b1-clear-units-queue.png', fullPage: true });
  await pick(jordan, 'Ethan Brooks');
  let t = await panel(jordan);
  check(/04\s*High school approval[^\n]*✓/i.test(t.replace(/\n/g, ' ')) || /High school approval · ✓/i.test(t), 'Ethan: High school approval done before Clear units');
  await Promise.all([jordan.waitForURL(/done=cleared/), clearUnits(jordan)]);
  await pick(jordan, 'Lucas Hart');
  await Promise.all([jordan.waitForURL(/done=cleared/), clearUnits(jordan)]);

  // Send Sofia back: her high school approval must reset too.
  await pick(jordan, 'Sofia Nguyen');
  await jordan.fill('#n7', 'PSY 1 is full. Please pick another class.');
  await Promise.all([jordan.waitForURL(/done=sent_back/), jordan.click('button:has-text("Send back to student")')]);
  await tab(jordan, 'All students');
  await pick(jordan, 'Sofia Nguyen');
  t = await panel(jordan);
  check(/Step 03 · Course selection/i.test(t), 'sent back: Sofia reopened to Course selection');
  check(/High school approval · ✓/i.test(t), 'sent back: classes the high school already approved stay approved');

  await tab(jordan, 'Prerequisites');
  check(await seen(jordan, 'text=Prerequisites · 2'), 'Ethan + Lucas in prerequisite queue');
  await pick(jordan, 'Ethan Brooks');
  await jordan.click('label:has-text("Approve")');
  await Promise.all([jordan.waitForURL(/done=prereq/), (async () => { if (await jordan.locator('input[name="ncws"]').count()) await jordan.locator('input[name="ncws"]').check(); await jordan.click('button:has-text("Save decisions")'); })()]);
  await pick(jordan, 'Lucas Hart');
  await jordan.click('label:has-text("Decline")');
  await jordan.fill('#n8', 'AJ 1 needs ENGL 1A eligibility first.');
  await Promise.all([jordan.waitForURL(/done=prereq/), (async () => { if (await jordan.locator('input[name="ncws"]').count()) await jordan.locator('input[name="ncws"]').check(); await jordan.click('button:has-text("Save decisions")'); })()]);
  await tab(jordan, 'All students');
  await pick(jordan, 'Lucas Hart');
  t = await panel(jordan);
  const requested = (await jordan.locator('form:has(input[type=hidden][name="courseId"])').allInnerTexts()).join(' ');
  check(!requested.includes('AJ 1') && requested.includes('ENGL C1000'), 'Lucas: AJ 1 declined, ENGL C1000 kept');
  check(/Step 07 · (Register|Ready to register)/i.test(t), 'Lucas: on to Register after prerequisites');

  // Override on Noah.
  await pick(jordan, 'Noah Patel');
  await jordan.locator('form:has(input[name="stepId"][value="3"]) button:has-text("Mark complete")').click();
  await jordan.waitForURL(/done=moved/);
  check(/Step 04 · High school approval/i.test(await panel(jordan)), 'forward: Noah now at High school approval');

  const ethan = await login(b, 'ethan.b@student.suhsd.net');
  check(await seen(ethan, 'text=Step 06 complete.'), 'Ethan sees prerequisite approved (step 06)');
  const sofia = await login(b, 'sofia.n@student.suhsd.net');
  await sofia.goto(B + '/student/steps/2');
  check(await seen(sofia, 'text=PSY 1 is full'), 'Sofia sees Shasta College note');
  check(await seen(sofia, 'text=Note from Shasta College'), 'note attributed to Shasta College');

  for (const p of [maya, rosa, jordan, ethan, sofia]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
