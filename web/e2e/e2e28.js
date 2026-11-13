// Email is connected (a stand-in mail server; see e2e28.env): reset links go ONLY to the email on file, invites are
// emailed, links use SITE_URL. Plus the audit fixes: staff signatures hidden from students, retired students out of
// the queues, paging, moving a class to another term, safe CSV exports, security headers.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http');
const fs = require('fs');
const path = require('path');
const B = 'http://localhost:3100', DATA = path.join(__dirname, '..', 'data'), DB = path.join(DATA, 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);

// Stand-in for the email service: keeps every message the site sends.
const mails = [];
const mailServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => { mails.push({ auth: req.headers.authorization, ...JSON.parse(body) }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"test"}'); });
});
const lastMail = () => mails[mails.length - 1];

async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}

(async () => {
  await new Promise((r) => mailServer.listen(3999, r));
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const id = (email) => sql('SELECT id FROM users WHERE email = ?', email)[0].id;
  const ethan = id('ethan.b@student.suhsd.net'), maya = id('maya.r@student.suhsd.net');

  // --- Security headers ---
  const h = (await fetch(B + '/login')).headers;
  check(h.get('x-frame-options') === 'DENY' && h.get('x-content-type-options') === 'nosniff' && !h.get('x-powered-by'), 'security headers are set');

  // --- Email connected: status + test email ---
  const sa = await login(b, 'dortiz@shastacollege.edu');
  await sa.goto(B + '/admin/users');
  check(await seen(sa, '[data-mail-status] >> text=Email is connected.'), 'Users page shows email is connected');
  await Promise.all([sa.waitForURL(/mailtest=ok/), sa.click('button:has-text("Send me a test email")')]);
  check(lastMail().to[0] === 'dortiz@shastacollege.edu' && lastMail().auth === 'Bearer test-key' && lastMail().text.includes('http://localhost:3100'), 'test email sent to the admin, with the fixed site address');

  // --- Forgot password: typed with different capitals; the link goes to the address on file, never on screen ---
  const f = await (await b.newContext()).newPage();
  let n = mails.length;
  await f.goto(B + '/forgot'); await f.fill('input[name="email"]', 'Maya.R@Student.SUHSD.net');
  await Promise.all([f.waitForURL(/sent=1/), f.click('button:has-text("Send reset link")')]);
  check(mails.length === n + 1 && lastMail().to.length === 1 && lastMail().to[0] === 'maya.r@student.suhsd.net', 'reset email goes to the address on file');
  check((await f.locator('a[href*="/reset/"]').count()) === 0 && !f.url().includes('demo='), 'reset link is not shown on screen when email is connected');
  const link = /http:\/\/localhost:3100\/reset\/[\w-]+/.exec(lastMail().text)[0];
  check(!!link, 'reset link uses SITE_URL');
  n = mails.length;
  await f.goto(B + '/forgot'); await f.fill('input[name="email"]', 'someone-else@example.org');
  await Promise.all([f.waitForURL(/sent=1/), f.click('button:has-text("Send reset link")')]);
  check(mails.length === n, 'an email with no account gets nothing (same answer on screen)');
  await f.goto(link); await f.fill('#pw', 'newpass-2027'); await f.fill('#pw2', 'newpass-2027');
  await Promise.all([f.waitForURL(/login\?reset=1/), f.click('button:has-text("Save new password")')]);
  const m = await login(b, 'maya.r@student.suhsd.net', 'newpass-2027');
  check(m.url().includes('/student'), 'emailed link resets the password');

  // --- Admin reset: emailed to the address on file; the admin never sees the link ---
  n = mails.length;
  await sa.goto(B + '/admin/users?q=Sofia');
  await Promise.all([sa.waitForURL(/resetsent=/), sa.click('tr:has-text("Sofia Nguyen") button:has-text("Email reset link")')]);
  check(mails.length === n + 1 && lastMail().to[0] === 'sofia.n@student.suhsd.net', 'admin reset goes to the student’s email on file');
  check(!sa.url().includes('token') && (await sa.locator('code:has-text("/reset/")').count()) === 0 && await seen(sa, 'text=Reset link emailed to Sofia Nguyen'), 'admin sees a confirmation, not the link');

  // --- Invites are emailed ---
  n = mails.length;
  await sa.goto(B + '/admin/users?add=1');
  await sa.fill('input[name="first"]', 'Nina'); await sa.fill('input[name="last"]', 'Vale'); await sa.fill('input[name="email"]', 'nina.vale@shastacollege.edu');
  await sa.locator('input[name="role"][value="admin"]').locator('xpath=..').click();
  await Promise.all([sa.waitForURL(/invited=\d+&emailed=1/), sa.click('button:has-text("Create invite")')]);
  check(mails.length === n + 1 && lastMail().to[0] === 'nina.vale@shastacollege.edu' && /localhost:3100\/invite\//.test(lastMail().text), 'new user invite is emailed');

  // --- Students can't open a staff signature ---
  fs.writeFileSync(path.join(DATA, 'uploads', 't-hs-sig.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const hsId = id('ralvarez@suhsd.net');
  const sig = Number(sql("INSERT INTO files (student_id, uploaded_by, kind, filename, mime, size, stored_name) VALUES (?, ?, 'hs_signature', 'sig.png', 'image/png', 68, 't-hs-sig.png')", maya, hsId).lastInsertRowid);
  check((await m.request.get(`${B}/files/${sig}`)).status() === 404, 'student can’t open the high school staff signature');
  check((await sa.request.get(`${B}/files/${sig}`)).status() === 200, 'admins still can');

  // --- Moving a class to another term ---
  const math = sql("SELECT id FROM courses WHERE code = 'MATH 13'")[0].id, hist = sql("SELECT id FROM courses WHERE code = 'HIST 17'")[0].id;
  sql("UPDATE course_requests SET prereq_status = 'approved', prereq_at = ? WHERE student_id = ? AND course_id = ?", new Date().toISOString(), ethan, math);
  sql('INSERT INTO course_requests (student_id, course_id, term_id) VALUES (?, ?, 2)', ethan, hist); // HIST 17 already in Summer too
  await sa.goto(`${B}/admin/students?tab=all&student=${ethan}`);
  const row = (code) => sa.locator(`form:has(input[name="courseId"][value="${code}"]):has(input[name="fromTermId"][value="1"])`);
  await row(hist).locator('select[name="termId"]').selectOption('2');
  await Promise.all([sa.waitForURL(/error=term_taken/), row(hist).locator('button:has-text("Save")').click()]);
  check(await seen(sa, 'text=already requested for that term'), 'moving to a term the class is already in says so');
  await row(math).locator('select[name="termId"]').selectOption('2');
  await Promise.all([sa.waitForURL(/done=course_term/), row(math).locator('button:has-text("Save")').click()]);
  const moved = sql('SELECT term_id, prereq_status, hs_status FROM course_requests WHERE student_id = ? AND course_id = ?', ethan, math)[0];
  check(moved.term_id === 2 && moved.prereq_status === null && moved.hs_status === 'pending', 'moved class needs prerequisite review and high school approval again');

  // --- Seniors export: formulas are neutralised ---
  sql("UPDATE users SET first_name = '=HYPERLINK(\"http://x\")', plans_shasta = 'yes', plans_year = (SELECT plans_year FROM users WHERE plans_year IS NOT NULL LIMIT 1), plans_at = ? WHERE id = ?", new Date().toISOString(), ethan);
  const csv = await (await sa.request.get(B + '/admin/seniors.csv')).text();
  check(csv.includes(`"'=HYPERLINK(""http://x"")"`), 'seniors export shows a formula-looking name as text');
  sql("UPDATE users SET first_name = 'Ethan' WHERE id = ?", ethan);

  // --- Retired students: out of the queues, still under All students ---
  const jk = await login(b, 'jkim@shastacollege.edu');
  await jk.goto(B + '/admin/students');
  // Whoever is first in the College review queue gets retired.
  const who = (await jk.locator('tbody tr a.rowa strong').first().innerText()).trim();
  const [first, ...rest] = who.split(' ');
  const retiree = sql('SELECT id FROM users WHERE first_name = ? AND last_name = ?', first, rest.join(' '))[0].id;
  sql('UPDATE users SET disabled = 1, retired_at = ? WHERE id = ?', new Date().toISOString(), retiree);
  await jk.goto(B + '/admin/students');
  check((await jk.locator('table').getByText(who).count()) === 0, `retired student (${who}) leaves the College review queue`);
  await jk.goto(B + '/admin/students?tab=all&q=' + encodeURIComponent(who));
  check(await seen(jk, `tr:has-text("${who}") >> text=Retired`), 'retired student is still under All students, labelled');
  const hs = await login(b, 'ralvarez@suhsd.net');
  for (const t of ['ready', 'incomplete', 'approved']) {
    await hs.goto(B + '/counselor?tab=' + t);
    check((await hs.locator('table').getByText(who).count()) === 0, `high school staff don’t see the retired student (${t})`);
  }

  // --- Paging ---
  const d = new DatabaseSync(DB);
  const ins = d.prepare("INSERT INTO users (first_name, last_name, email, role, school_id, status, grad_year, grade, grade_confirmed_year) VALUES (?, 'Zz-Page', ?, 'student', 2, 'active', 2029, 10, 2027)");
  const enr = d.prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?, 1)');
  d.exec('BEGIN'); for (let i = 0; i < 230; i++) enr.run(Number(ins.run('P' + String(i).padStart(3, '0'), `page${i}@example.org`).lastInsertRowid)); d.exec('COMMIT'); d.close();
  await jk.goto(B + '/admin/students?tab=all');
  check(await seen(jk, '[data-pager] >> text=Page 1 of 2') && (await jk.locator('tbody tr.sel, tbody tr:has(a.rowa)').count()) <= 200, 'long lists are paged (200 per page)');
  await Promise.all([jk.waitForURL(/page=2/), jk.click('[data-pager] >> text=Next →')]);
  check(await seen(jk, '[data-pager] >> text=Page 2 of 2') && await seen(jk, 'text=P229'), 'next page shows the rest');

  await b.close(); mailServer.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
