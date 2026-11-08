const { chromium } = require('playwright');
const { grantConsent, addCe } = require('./testlib');
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
  const tab = await login(b, 'dortiz@shastacollege.edu');

  // Dual Enrollment list on Anderson HS's page.
  await tab.goto(B + '/admin/schools');
  await tab.click('tr:has-text("Anderson High School") >> text=Edit steps');
  await tab.waitForURL(/schools\/\d/);
  check(await seen(tab, 'text=Dual Enrollment courses at Anderson High School'), 'school page has DE course list');
  const grant = tab.locator('#courses form:has(input[value="ENGL C1000"])');
  await grant.locator('input[name="period"]').fill('1'); await grant.locator('input[name="teacher"]').fill('Ms. Grant');
  await grant.locator('button:has-text("Save")').click();
  await grant.locator('text=✓ Saved').waitFor(); // saves in place, no reload
  check(await tab.locator('#courses input[value="Ms. Grant"]').count() === 1 && await tab.inputValue('#courses form:has(input[value="Ms. Grant"]) input[name="period"]') === '1', 'edited period + teacher saved');
  const add = tab.locator('#courses form:has(button:has-text("Add course"))');
  await add.locator('input[name="code"]').fill('psy 1'); await add.locator('input[name="title"]').fill('General Psychology');
  await add.locator('input[name="units"]').fill('3'); await add.locator('input[name="period"]').fill('4'); await add.locator('input[name="teacher"]').fill('Mr. Ames');
  await add.locator('button:has-text("Add course")').click();
  check(await seen(tab, '#courses input[value="PSY 1"]'), 'DE course added (code uppercased)');
  await tab.screenshot({ path: OUT + '/f1-school-de-courses.png', fullPage: true });

  // Concurrent Enrollment is free entry: no list to keep up.
  await tab.click('.admin-nav >> text=Courses');
  check(await seen(tab, 'text=Students can also type in any class that'), 'Courses page: Concurrent list plus type-in');

  // Student at Anderson sees Anderson's DE sections and the CE list.
  const jamie = await login(b, 'jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/1'); await jamie.fill('#sid', 'S18231111');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Save my ID")')]);
  grantConsent('jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/2');
  check(await seen(jamie, '[data-kind="de"] >> text=Taught at Anderson High School'), 'DE section labelled with the high school');
  check(await seen(jamie, '[data-kind="de"] >> text=Period 1 · Ms. Grant'), 'DE shows period + teacher');
  check(await seen(jamie, '[data-kind="de"] >> text=Period 4 · Mr. Ames'), 'new DE course offered');
  check(!(await jamie.isVisible('text=Mr. Hall')), "another school's DE sections hidden");
  await jamie.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await addCe(jamie, 'BIOL 2', 4);
  await jamie.screenshot({ path: OUT + '/f3-student-de-ce.png', fullPage: true });
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Submit courses")')]);
  await jamie.goto(B + '/student/steps/7');
  check(await seen(jamie, 'text=Period 1 · Ms. Grant') && await seen(jamie, '.tag:text-is("DE")') && await seen(jamie, '.tag:text-is("CE")'), 'requested classes show DE/CE and period/teacher');

  for (const p of [tab, jamie]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
