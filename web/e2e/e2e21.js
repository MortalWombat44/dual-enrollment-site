// Student files: ZIP export by graduating class, then delete after a 10-minute (cancellable) timer. Plus step 1 links.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const B = 'http://localhost:3100', DATA = require('path').join(__dirname, '..', 'data');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DATA + '/de.sqlite'); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
const row = (p) => p.locator('tr[data-class-year="2028"]');

(async () => {
  await fetch(B + '/signup');
  // Two stored files for Maya (class of 2028): a parent signature and an uploaded form from before uploads were turned off.
  const maya = sql("SELECT id FROM users WHERE email = 'maya.r@student.suhsd.net'")[0].id;
  const sig = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'); const pdf = fs.readFileSync(__dirname + '/signed-form.pdf');
  fs.writeFileSync(DATA + '/uploads/t-sig.png', sig); fs.writeFileSync(DATA + '/uploads/t-form.pdf', pdf);
  sql("INSERT INTO files (student_id, uploaded_by, kind, filename, mime, size, stored_name) VALUES (?, ?, 'signature', 'signature.png', 'image/png', ?, 't-sig.png')", maya, maya, sig.length);
  sql("INSERT INTO files (student_id, uploaded_by, kind, filename, mime, size, stored_name) VALUES (?, ?, 'consent_upload', 'consent.pdf', 'application/pdf', ?, 't-form.pdf')", maya, maya, pdf.length);

  const b = await chromium.launch();
  check((await (await login(b, 'jkim@shastacollege.edu')).request.get(B + '/admin/files/export?year=2028')).status() === 404, 'college admins cannot export');
  const d = await login(b, 'dortiz@shastacollege.edu');
  await d.goto(B + '/admin/files');
  check(/Class of 2028/.test(await row(d).innerText()) && /Download the ZIP first/.test(await row(d).innerText()), 'class listed; delete needs an export first');

  const z = await d.request.get(B + '/admin/files/export?year=2028');
  fs.writeFileSync(__dirname + '/class2028.zip', await z.body());
  const list = execFileSync('unzip', ['-Z1', __dirname + '/class2028.zip']).toString();
  check(z.status() === 200 && /Rivera_Maya_0412893\/record\.pdf/.test(list) && /Rivera_Maya_0412893\/\d+-signature\.png/.test(list) && /Rivera_Maya_0412893\/\d+-consent\.pdf/.test(list) && list.includes('index.csv'), 'ZIP: student folder with record PDF, files, and index.csv');
  const idx = execFileSync('unzip', ['-p', __dirname + '/class2028.zip', 'index.csv']).toString();
  check(idx.includes('Parent signature') && idx.includes('Uploaded consent form'), 'index.csv describes each file');
  execFileSync('unzip', ['-tq', __dirname + '/class2028.zip']);
  check(true, 'ZIP passes an integrity test');

  // Schedule, then cancel.
  await d.goto(B + '/admin/files');
  await Promise.all([d.waitForURL(/scheduled=2028/), row(d).locator('button:has-text("Delete files")').click()]);
  await d.locator('.flash').waitFor();
  check(/Deleting in (9|10):\d\d/.test(await row(d).innerText()), 'deletion scheduled with a 10-minute countdown');
  await Promise.all([d.waitForURL(/cancelled=1/), row(d).locator('button:has-text("Cancel deletion")').click()]);
  await d.locator('.flash').waitFor();
  check(sql("SELECT COUNT(*) n FROM files WHERE student_id = ?", maya)[0].n === 2 && fs.existsSync(DATA + '/uploads/t-sig.png'), 'cancelled: nothing deleted');

  // Schedule again and let the timer run out (moved into the past for the test).
  await Promise.all([d.waitForURL(/scheduled=2028/), row(d).locator('button:has-text("Delete files")').click()]);
  check(sql("SELECT COUNT(*) n FROM files WHERE student_id = ?", maya)[0].n === 2, 'nothing deleted before the timer runs out');
  sql("UPDATE file_deletions SET run_at = '2000-01-01T00:00:00.000Z' WHERE status = 'scheduled'");
  await d.goto(B + '/admin/files');
  check(sql("SELECT COUNT(*) n FROM files WHERE student_id = ?", maya)[0].n === 0 && !fs.existsSync(DATA + '/uploads/t-sig.png') && !fs.existsSync(DATA + '/uploads/t-form.pdf'), 'after the timer: files deleted from the database and disk');
  check(/Deleted .*\(2 files\)/.test(await row(d).innerText()), 'page shows when the files were deleted');
  check(sql("SELECT COUNT(*) n FROM users WHERE id = ?", maya)[0].n === 1, 'student account and record kept');
  const rec = await d.request.get(B + `/admin/audit.pdf?student=${maya}`);
  check(rec.status() === 200, 'student record PDF still builds without the files');

  // Step 1 links.
  const s = await login(b, 'jamie.l@student.andersonhigh.org');
  await s.goto(B + '/student/steps/1');
  check(await s.locator('a[href="https://www.shastacollege.edu/admissions-registration/apply-to-shasta-college/"]:has-text("Go to CCCApply and apply to Shasta College")').count() === 1, 'step 1: Go to CCCApply link');
  check(await s.locator('a[href="https://launch.comevo.com/shastacollege/1633"]').count() === 1, 'step 1: step-by-step guide link');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
