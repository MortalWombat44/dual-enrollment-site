// Warning before skipping prerequisite review; nudges; shared-ID grouping.
const clearUnits = require('./testlib').clearUnits;
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent, addCe } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext(desk)).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  await p.waitForLoadState('networkidle');
  return p;
}
const id = (e) => sql('SELECT id FROM users WHERE email = ?', e)[0].id;
const open = async (p, tab, email) => { await p.goto(B + `/admin/students?tab=${tab}&student=${id(email)}`); await p.waitForLoadState('networkidle'); };

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const J = 'jamie.l@student.andersonhigh.org', E = 'ethan.b@student.suhsd.net';
  const jm = await login(b, J);
  await jm.goto(B + '/student/steps/1'); await Promise.all([jm.waitForURL(/complete/), jm.click('button:has-text("Save my ID")')]);
  grantConsent(J);
  await jm.goto(B + '/student/steps/2'); await jm.waitForLoadState('networkidle');
  await addCe(jm, 'HIST C1010', 3); await jm.locator('.ce-row').last().locator('label').click(); await jm.locator('[data-prereq-notice] button').click();
  await Promise.all([jm.waitForURL(/complete/), jm.click('button:has-text("Submit courses")')]);
  const jordan = await login(b, 'jkim@shastacollege.edu');
  for (const e of [J, E]) { await open(jordan, 'units', e); await Promise.all([jordan.waitForURL(/done=cleared/), clearUnits(jordan)]); }
  await jordan.goto(B + '/admin/students?tab=prereq'); await jordan.waitForLoadState('networkidle');
  const order0 = await jordan.locator('tbody tr[class], tbody tr:not([class]) a.rowa strong').allInnerTexts();
  check((await jordan.locator('tbody a.rowa strong').allInnerTexts())[0] === 'Ethan Brooks', 'before nudging: primary-school student (Ethan) first');

  // Dana (super admin, not a college counselor): sees but can't decide; nudges Jamie.
  const dana = await login(b, 'dortiz@shastacollege.edu');
  await open(dana, 'prereq', J);
  check(await dana.locator('button:has-text("Save decisions")').isDisabled(), 'non-counselor can see the review but not decide');
  await dana.fill('input[name="note"][placeholder="Why it\'s urgent (optional)"]', 'Registration opens Monday.');
  await Promise.all([dana.waitForURL(/done=nudged/), dana.click('button:has-text("Nudge")')]);
  check(sql("SELECT n.message FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'jkim@shastacollege.edu' AND n.kind = 'nudge'").some((n) => /Registration opens Monday/.test(n.message)), 'college counselor notified of the nudge');
  await jordan.goto(B + '/admin/students?tab=prereq'); await jordan.waitForLoadState('networkidle');
  const first = jordan.locator('tbody tr[data-nudged="1"]').first();
  check((await jordan.locator('tbody a.rowa strong').allInnerTexts())[0] === 'Jamie Lee' && await first.locator('text=Nudged').count() === 1, 'nudged student moved to the top, tagged Nudged');
  check(/253, 236, 234|#fdecea/.test(await first.evaluate((el) => getComputedStyle(el).backgroundColor + el.style.background)), 'nudged row highlighted red');

  // Warning before marking prerequisite review complete (Dana on Ethan).
  await open(dana, 'all', E);
  let msg = '';
  dana.once('dialog', (d) => { msg = d.message(); d.dismiss(); });
  await dana.locator('form:has(input[name="stepId"][value="8"]) button:has-text("Mark complete")').click();
  await dana.waitForTimeout(500);
  check(/Prerequisite review isn’t done/.test(msg) && /MATH 13/.test(msg), 'pop-up warns that prerequisite review is not done (names the class)');
  check(sql("SELECT COUNT(*) n FROM step_progress WHERE student_id = ? AND step_id = 8 AND status = 'complete'", id(E))[0].n === 0, 'cancelled: nothing changed');
  let msg2 = '';
  dana.once('dialog', (d) => { msg2 = d.message(); d.dismiss(); });
  await dana.locator('form:has(input[name="stepId"][value="5"]) button:has-text("Mark complete")').click();
  await dana.waitForTimeout(500);
  check(/moves Ethan past it/.test(msg2), 'a later step warns too');
  dana.once('dialog', (d) => d.accept());
  await Promise.all([dana.waitForURL(/done=moved/), dana.locator('form:has(input[name="stepId"][value="8"]) button:has-text("Mark complete")').click()]);
  check(sql("SELECT COUNT(*) n FROM step_progress WHERE student_id = ? AND step_id = 8 AND status = 'complete'", id(E))[0].n === 1, 'confirmed: done anyway');
  dana.once('dialog', (d) => { msg = d.message(); d.dismiss(); });
  await dana.locator('form:has(input[name="stepId"][value="1"])').count();

  // Counselor decides Jamie: nudge cleared.
  await open(jordan, 'prereq', J);
  await jordan.locator('label:has-text("Approve")').first().click();
  await Promise.all([jordan.waitForURL(/done=prereq/), (async () => { if (await jordan.locator('input[name="ncws"]').count()) await jordan.locator('input[name="ncws"]').check(); await jordan.click('button:has-text("Save decisions")'); })()]);
  check(sql('SELECT cleared_at FROM nudges WHERE student_id = ?', id(J))[0].cleared_at, 'decision clears the nudge');

  // Shared IDs: grouped with a red bracket. (Make a second pair, plus a third account on it.)
  sql("UPDATE users SET student_number = (SELECT student_number FROM users WHERE email = 'lucas.h@student.suhsd.net') WHERE email IN ('maya.r@student.suhsd.net', 'jamie.l@student.andersonhigh.org')");
  await jordan.goto(B + '/admin/students?tab=ids'); await jordan.waitForLoadState('networkidle');
  const ids = await jordan.locator('tbody tr[data-shared-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-shared-id')));
  const grouped = ids.every((x, i) => i === 0 || x === ids[i - 1] || !ids.slice(0, i - 1).includes(x));
  check(ids.length >= 4 && grouped, `accounts sharing an ID are listed together (${ids.join(', ')})`);
  check(/179, 38, 30/.test(await jordan.locator('tbody tr[data-shared-id] td').first().evaluate((el) => getComputedStyle(el).boxShadow)), 'red bracket on the left');
  check(await jordan.locator('text=/Shasta College ID \\d+ · 3 accounts/').count() === 1 && await jordan.locator('text=/Shasta College ID \\d+ · 2 accounts/').count() === 1, 'each group labeled with the shared ID and account count');
  await jordan.screenshot({ path: __dirname + '/shots/shared-ids.png' });
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
