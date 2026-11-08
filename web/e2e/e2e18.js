// Per-term prerequisite decisions, HS "move back" message, per-term registration, archiving closed-term requests.
const clearUnits = require('./testlib').clearUnits;
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent, addCe, fillProfile } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const r = d.prepare(q).all(...a); d.close(); return r; };
const reqs = (email) => sql(`SELECT c.code || '@' || t.name || CASE WHEN r.archived_at IS NULL THEN '' ELSE ' (archived)' END AS x
  FROM course_requests r JOIN courses c ON c.id = r.course_id JOIN terms t ON t.id = r.term_id JOIN users u ON u.id = r.student_id WHERE u.email = ? ORDER BY t.id, c.code`, email).map((r) => r.x).join(', ');
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
const openStudent = async (j, tab, name) => {
  await j.goto(B + '/admin/students' + (tab ? `?tab=${tab}` : ''));
  await Promise.all([j.waitForURL(/student=/), j.locator('a.rowa', { hasText: name }).first().click()]);
  await j.waitForLoadState('networkidle');
};
const changeClasses = async (s, fn) => {
  await s.goto(B + '/student/steps/2');
  if (await s.locator('button:has-text("Change or remove classes")').count()) { await s.click('button:has-text("Change or remove classes")'); }
  await s.waitForSelector('button:has-text("Submit courses"), button:has-text("Resubmit courses")');
  await fn();
  await Promise.all([s.waitForURL(/complete/), s.locator('button:has-text("Submit courses"), button:has-text("Resubmit courses")').click()]);
};

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const J = 'jamie.l@student.andersonhigh.org';
  const s = await login(b, J);
  await s.goto(B + '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent(J);

  // 3 · Prerequisite review per term.
  await changeClasses(s, async () => {
    await addCe(s, 'HIST C1010', 3); await s.locator('.ce-row').last().locator('label').click();
    await addCe(s, 'HIST C1010', 3, 'Summer 2027'); await s.locator('.ce-row').last().locator('label').click();
  });
  const j = await login(b, 'jkim@shastacollege.edu');
  await openStudent(j, '', 'Jamie Lee');
  await Promise.all([j.waitForURL(/done=cleared/), clearUnits(j)]);
  await openStudent(j, 'prereq', 'Jamie Lee');
  check(await j.locator('[data-prereq]').count() === 2, 'one prerequisite decision per term');
  await j.locator('[data-prereq*="Spring"] label:has-text("Approve")').click();
  await j.locator('[data-prereq*="Summer"] label:has-text("Decline")').click();
  await j.fill('#n8', 'Summer section needs the prerequisite first.');
  await Promise.all([j.waitForURL(/done=prereq/), (async () => { if (await j.locator('input[name="ncws"]').count()) await j.locator('input[name="ncws"]').check(); await j.click('button:has-text("Save decisions")'); })()]);
  check(reqs(J) === 'HIST C1010@Spring 2027', `declining Summer kept Spring (${reqs(J)})`);

  // 4 · Move back on High school approval explains instead.
  await openStudent(j, 'all', 'Ethan Brooks');
  await Promise.all([j.waitForURL(/done=hs_already/), j.locator('form:has(input[name="stepId"][value="4"]) button:has-text("Move back")').click()]);
  await j.locator('.flash').waitFor(); console.log('   flash:', await j.locator('.flash').innerText());
  check(await j.locator('text=already approved by the high school').count() > 0, 'move back on HS approval says the requests were already approved');

  // 5 · Register per term. Open Spring + Summer registration (dates in the past).
  sql("UPDATE terms SET registration_opens = '2026-01-01T16:00:00.000Z'");
  await s.goto(B + '/student/steps/5');
  await Promise.all([s.waitForURL(/steps\/5\/complete/), s.click('button:has-text("I\'m registered for Spring 2027")')]);
  check(true, 'registered for Spring');
  await changeClasses(s, async () => { await addCe(s, 'COMM C1000', 3, 'Summer 2027'); });
  await openStudent(j, '', 'Jamie Lee');
  await Promise.all([j.waitForURL(/done=cleared/), clearUnits(j)]);
  // (COMM C1000 has no prerequisite, and HIST C1010 stays approved: nothing to re-review.)
  await s.goto(B + '/student/steps/5');
  check(await s.locator('button:has-text("I\'m registered for Summer 2027")').count() === 1, 'new Summer class: Register asks again, for Summer');
  check(await s.locator('text=✓ Registered for Spring 2027').count() === 1, 'Spring registration still shown');
  await Promise.all([s.waitForURL(/steps\/5\/complete/), s.click('button:has-text("I\'m registered for Summer 2027")')]);
  check(sql("SELECT COUNT(*) n FROM registrations g JOIN users u ON u.id = g.student_id WHERE u.email = ?", J)[0].n === 2, 'two term registrations saved');

  // 6 · Turning Summer off archives requests from students who hadn't registered.
  const K = 'kai.a@student.example.org';
  const k = await (await b.newContext()).newPage();
  await k.goto(B + '/signup');
  await k.fill('#first', 'Kai'); await k.fill('#last', 'Archive'); await k.fill('#email', K);
  await k.selectOption('#school', { label: 'Anderson High School · Anderson Union HSD' }); await k.selectOption('#grade', '11');
  const grads = await k.locator('#grad option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean)); await k.selectOption('#grad', grads[1]);
  await k.fill('#sid', '0418888'); await k.fill('#pw', 'kaipass123'); await k.fill('#pw2', 'kaipass123');
  await fillProfile(k);
  await Promise.all([k.waitForURL(/\/student$/), k.click('button:has-text("Create account")')]);
  await k.goto(B + '/student/steps/1'); await Promise.all([k.waitForURL(/complete/), k.click('button:has-text("Save my ID")')]);
  grantConsent(K);
  await changeClasses(k, async () => { await addCe(k, 'BIOL C1000', 4, 'Summer 2027'); });
  const d = await login(b, 'dortiz@shastacollege.edu');
  await d.goto(B + '/admin/terms');
  const summer = d.locator('form:has(input[value="Summer 2027"])');
  await summer.locator('input[name="active"]').uncheck();
  await Promise.all([d.waitForURL(/archived=/), summer.locator('button:has-text("Save")').click()]);
  await d.locator('.flash').waitFor();
  check(await d.locator('text=were archived').count() + await d.locator('text=was archived').count() > 0, 'Terms page says requests were archived');
  check(reqs(K) === 'BIOL C1000@Summer 2027 (archived)', `unregistered student's Summer request archived (${reqs(K)})`);
  check(!reqs(J).includes('archived'), `registered student's Summer classes kept (${reqs(J)})`);
  await k.goto(B + '/student/steps/2');
  check(await k.locator('button:has-text("Submit courses")').count() === 1, 'Kai (nothing left) is back at Course selection');
  check(await k.locator('text=Registration was turned off for Summer 2027').count() === 1, 'Kai told why');
  await openStudent(d, 'all', 'Kai Archive');
  check(await d.locator('[data-archived] >> text=BIOL C1000').count() === 1, 'admin panel lists the archived request');
  // Jamie reopens classes: Summer (closed) classes are kept as is, not moved.
  await changeClasses(s, async () => { check(await s.locator('text=Kept as they are').count() === 1, 'closed-term classes shown as kept'); });
  check(reqs(J) === 'HIST C1010@Spring 2027, COMM C1000@Summer 2027', `nothing moved terms (${reqs(J)})`);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
