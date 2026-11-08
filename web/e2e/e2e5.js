const { chromium } = require('playwright');
const clearUnits = require('./testlib').clearUnits;
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

  // Dana, super admin.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  check(tab.url().endsWith('/admin/students'), 'Tabitha signs in with her password');
  check(await seen(tab, '.admin-nav >> text=Users') && await seen(tab, '.admin-nav >> text=Terms'), 'Tabitha has super admin menu');
  check(await seen(tab, 'text=Super admin'), 'labelled Super admin');

  // Jordan: primary school first + report.
  const jordan = await login(b, 'jkim@shastacollege.edu');
  check(await seen(jordan, 'td:has-text("Your schools")'), 'Your schools section shown first');
  check(await seen(jordan, 'text=at your schools'), 'stat counts primary-school items');
  await jordan.goto(B + '/admin/reports');
  const stat = async (label) => Number((await jordan.locator(`div:text-is("${label}") + div`).innerText()).trim());
  check(await stat('Total') === 3 && await stat('For primary schools') === 2 && await stat('Outside primary schools') === 1, 'report counts: 3 total, 2 primary, 1 outside');
  check(await seen(jordan, 'td:has-text("1.2 days")'), 'Enterprise average wait = 1.2 days (50h and 8h)');
  await jordan.screenshot({ path: OUT + '/c1-report.png', fullPage: true });
  await jordan.goto(B + '/admin/students');
  await pick(jordan, 'Ethan Brooks');
  await Promise.all([jordan.waitForURL(/done=cleared/), clearUnits(jordan)]);
  await jordan.goto(B + '/admin/reports');
  check(await stat('Total') === 4 && await stat('For primary schools') === 3, 'clearing Ethan counts toward primary schools');

  // Tabitha assigns Foothill as another primary school for Jordan.
  await tab.goto(B + '/admin/users?role=admin');
  const row = tab.locator('tr:has-text("Jordan Kim")');
  await row.locator('summary').click();
  await row.locator('label:has-text("Foothill High School") input').check();
  await Promise.all([tab.waitForURL(/updated=/), row.locator('button:has-text("Save")').click()]);
  check(await seen(tab, 'tr:has-text("Jordan Kim") >> text=Primary: Enterprise HS, Foothill HS'), 'primary schools saved');
  await jordan.reload();
  check(await stat('Outside primary schools') === 0, 'Foothill clearance now counts as primary');
  await tab.goto(B + '/admin/reports?admin=' + (await tab.evaluate(() => 0)));
  await tab.selectOption('select[name="admin"]', { label: 'Jordan Kim' });
  await Promise.all([tab.waitForURL(/admin=/), tab.click('button:has-text("View")')]);
  check(await seen(tab, 'h1:has-text("Jordan Kim")'), 'super admin can view another admin report');

  // Terms.
  await tab.goto(B + '/admin/terms');
  check(await seen(tab, 'input[value="Spring 2027"]') && await seen(tab, 'input[value="Summer 2027"]'), 'two active terms listed');
  await tab.fill('#tname', 'Fall 2027'); await tab.fill('#topens', '2027-08-02T08:00');
  await Promise.all([tab.waitForURL(/saved=/), tab.click('button:has-text("Add term")')]);
  check(await seen(tab, 'text=Saved Fall 2027'), 'term added');
  await tab.screenshot({ path: OUT + '/c2-terms.png', fullPage: true });
  const jamie = await login(b, 'jamie.l@student.andersonhigh.org');
  check(await seen(jamie, 'text=Summer 2027 · Anderson High School'), 'Jamie is in Summer 2027');
  check(await seen(jamie, 'text=Opens Apr 12'), 'Jamie sees Summer registration date');
  await tab.goto(B + '/admin/students?tab=all&term=2');
  check((await tab.locator('a.rowa strong').allInnerTexts()).join() === 'Jamie Lee', 'term filter shows only Summer students');
  await pick(tab, 'Jamie Lee');
  await tab.selectOption('select[name="courseId"]', { label: 'DE · PSYC C1000 · Introduction to Psychology (3)' });
  await tab.locator('form:has(select[name="courseId"]) select[name="termId"]').selectOption({ label: 'Spring 2027' });
  await Promise.all([tab.waitForURL(/done=course_added/), tab.click('button:text-is("Add")')]);
  await jamie.reload();
  check(await seen(jamie, 'text=Spring 2027 · Anderson High School'), 'class added in Spring 2027 puts Jamie in Spring');

  // High School Staff.
  await tab.goto(B + '/admin/users?role=counselor');
  check(await seen(tab, 'a.seg-opt:has-text("High School Staff")'), 'tab renamed High School Staff');
  const rosa = tab.locator('tr:has-text("Rosa Alvarez")');
  check(await seen(tab, 'tr:has-text("Rosa Alvarez") summary:has-text("High School Staff · Counselor")'), 'Rosa shown as High School Staff · Counselor');
  await rosa.locator('summary').click();
  await rosa.locator('select[name="staff_type"]').selectOption('teacher');
  await Promise.all([tab.waitForURL(/updated=/), rosa.locator('button:has-text("Save")').click()]);
  check(await seen(tab, 'tr:has-text("Rosa Alvarez") summary:has-text("High School Staff · Teacher")'), 'staff type changed to Teacher');
  await tab.goto(B + '/admin/users?add=1');
  await tab.click('.modal label:has-text("High School Staff")');
  check(await seen(tab, '#staff_type'), 'add dialog offers staff type');
  await tab.screenshot({ path: OUT + '/c3-add-hs-staff.png', fullPage: true });
  await tab.fill('#first', 'Kim'); await tab.fill('#last', 'Lopez'); await tab.fill('#email', 'klopez@suhsd.net');
  await tab.selectOption('#staff_type', 'other');
  await Promise.all([tab.waitForURL(/invited=/), tab.click('button:has-text("Create invite")')]);
  await tab.goto(B + '/admin/users?role=counselor');
  check(await seen(tab, 'tr:has-text("Kim Lopez") summary:has-text("High School Staff · Other")'), 'new staff saved as Other');

  const rosaP = await login(b, 'ralvarez@suhsd.net');
  check(await seen(rosaP, 'text=Next registration · Spring 2027'), 'counselor sees next registration term');

  for (const p of [tab, jordan, jamie, rosaP]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
