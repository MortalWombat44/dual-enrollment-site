// Clear units + prerequisites in parallel; My schools filter; stock + typed concurrent classes;
const clearUnits = require('./testlib').clearUnits;
// per-class prerequisite flags (admin and student); Ready to register / Overdue registration.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent, addCe } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext(desk)).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  await p.waitForLoadState('networkidle');
  return p;
}
const id = (e) => sql('SELECT id FROM users WHERE email = ?', e)[0].id;
const names = (p) => p.locator('tbody a.rowa strong').allInnerTexts();
const go = async (p, url) => { await p.goto(B + url); await p.waitForLoadState('networkidle'); };
const J = 'jamie.l@student.andersonhigh.org';
const pending = () => sql(`SELECT c.code FROM course_requests r JOIN courses c ON c.id = r.course_id WHERE r.student_id = ? AND (c.prerequisite IS NOT NULL OR r.prereq_flag = 1) AND r.prereq_status IS NULL ORDER BY c.code`, id(J)).map((r) => r.code).join(', ');

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const s = await login(b, J);
  await go(s, '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent(J);
  await go(s, '/student/steps/2');
  check(await s.locator('[data-kind="ce"] label:has-text("MATH 13")').count() === 1 && await s.locator('button:has-text("Add a concurrent class")').count() === 1, 'concurrent: stock list plus type-in');
  await s.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await s.click('[data-kind="ce"] label:has-text("MATH 13")');
  await addCe(s, 'HIST C1010', 3);
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);

  // Parallel queues.
  const j = await login(b, 'jkim@shastacollege.edu');
  await go(j, '/admin/students'); const units = await names(j);
  await go(j, '/admin/students?tab=prereq'); const pre = await names(j);
  check(units.includes('Jamie Lee') && pre.includes('Jamie Lee'), 'student is in Clear units and Prerequisites at the same time');

  // My schools filter (Jordan's primary: Enterprise).
  await go(j, '/admin/students?tab=all&school=mine');
  const mineNames = await names(j);
  check(mineNames.length > 0 && !mineNames.includes('Jamie Lee') && mineNames.includes('Maya Rivera'), 'My schools shows only primary-school students');
  check(await j.locator('select[name="school"] option[value="mine"]').count() === 1, 'My schools option in the school filter');

  // Clear units first; then flag a class the student said had no prerequisite.
  await go(j, `/admin/students?student=${id(J)}`);
  await Promise.all([j.waitForURL(/done=cleared/), clearUnits(j)]);
  check(pending() === 'MATH 13', 'only the listed prerequisite class is waiting');
  const hist = j.locator('form:has(input[name="courseId"]):has-text("HIST C1010")').first();
  check(await hist.locator('text=No prerequisite selected').count() === 1, 'admin sees the student selected no prerequisite');
  await Promise.all([j.waitForURL(/prereq_flagged/), hist.locator('button:has-text("Needs prerequisite review")').click()]);
  check(pending() === 'HIST C1010, MATH 13', 'admin flag puts it in the queue after Clear units');

  // Student requests review for a class they skipped.
  await go(s, '/student/steps/2');
  await Promise.all([s.waitForURL(/prereq=sent/), s.locator('form:has-text("ENGL C1000") button:has-text("This class has a prerequisite")').click()]);
  check(pending() === 'ENGL C1000, HIST C1010, MATH 13', 'student request puts it in the queue too');

  // Counselor approves all three: not until "Student cleared in NCWS" is checked.
  await go(j, `/admin/students?tab=prereq&student=${id(J)}`);
  for (const l of await j.locator('[data-prereq] label:has-text("Approve")').all()) await l.click();
  await Promise.all([j.waitForURL(/error=ncws/), j.click('button:has-text("Save decisions")')]);
  check(pending() === 'ENGL C1000, HIST C1010, MATH 13', 'cannot approve without "Student cleared in NCWS"');
  await go(j, `/admin/students?tab=prereq&student=${id(J)}`);
  for (const l of await j.locator('[data-prereq] label:has-text("Approve")').all()) await l.click();
  await Promise.all([j.waitForURL(/done=prereq/), (async () => { if (await j.locator('input[name="ncws"]').count()) await j.locator('input[name="ncws"]').check(); await j.click('button:has-text("Save decisions")'); })()]);
  check(pending() === '', 'all approved');

  // Ready to register (before the date), then Overdue (open > 5 days).
  await go(j, `/admin/students?tab=all&student=${id(J)}`);
  check(await j.locator('tbody tr:has-text("Jamie Lee") >> text=Ready to register').count() === 1, 'before registration opens: Ready to register');
  const past = new Date(Date.now() - 10 * 864e5).toISOString();
  sql("UPDATE terms SET registration_opens = ? WHERE id = 1", past);
  sql('UPDATE step_progress SET completed_at = ? WHERE student_id = ?', past, id(J));
  sql('UPDATE course_requests SET prereq_at = ?, hs_at = ? WHERE student_id = ?', past, past, id(J));
  sql('UPDATE unit_clearances SET cleared_at = ? WHERE student_id = ?', past, id(J));
  await go(j, '/admin/students?tab=overdue');
  check((await names(j)).includes('Jamie Lee') && await j.locator('a.seg-opt:has-text("Overdue registration")').count() === 1, 'open more than 5 days: Overdue registration tab');
  await go(s, '/student/steps/5');
  check(await s.locator('text=Your registration is overdue.').count() === 1, 'student sees the overdue notice');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("I\'m registered for Spring 2027")')]);
  await go(j, '/admin/students?tab=overdue');
  check(!(await names(j)).includes('Jamie Lee'), 'confirming registration clears it');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
