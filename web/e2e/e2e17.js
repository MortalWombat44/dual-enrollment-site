// Tabitha's seeded account is gone; replaced young student documents are deleted (row + disk).
const { chromium } = require('playwright');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent, fillProfile } = require('./testlib');
const B = 'http://localhost:3100', DATA = require('path').join(__dirname, '..', 'data');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const q = (sql) => { const d = new DatabaseSync(DATA + '/de.sqlite'); const r = d.prepare(sql).all(); d.close(); return r; };
const pdf = fs.readFileSync(__dirname + '/signed-form.pdf');
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
async function sendDocs(y, tag) {
  await y.goto(B + '/student/steps/9');
  await y.setInputFiles('#transcript', { name: `transcript-${tag}.pdf`, mimeType: 'application/pdf', buffer: pdf });
  await y.setInputFiles('#letter', { name: `letter-${tag}.pdf`, mimeType: 'application/pdf', buffer: pdf });
  await Promise.all([y.waitForURL(/complete/), y.click('button:has-text("Send documents")')]);
}
(async () => {
  await fetch(B + '/signup');
  check(q("SELECT 1 FROM users WHERE email = 'tmiller@shastacollege.edu'").length === 0, 'Tabitha Miller account is not in the database');
  const b = await chromium.launch();
  const t = await (await b.newContext()).newPage();
  await t.goto(B + '/login'); await t.fill('#email', 'tmiller@shastacollege.edu'); await t.fill('#password', 'ShastaDE2027');
  await t.click('button:has-text("Sign in")'); await t.waitForLoadState('networkidle');
  check(t.url().includes('/login'), 'old Tabitha password no longer signs in');

  const y = await (await b.newContext()).newPage();
  await y.goto(B + '/signup');
  await y.fill('#first', 'Lena'); await y.fill('#last', 'Docs'); await y.fill('#email', 'lena.d@student.example.org');
  await y.selectOption('#school', { label: 'Anderson High School · Anderson Union HSD' }); await y.selectOption('#grade', '8');
  const grads = await y.locator('#grad option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean)); await y.selectOption('#grad', grads.at(-1));
  await y.fill('#sid', '0417777'); await y.fill('#pw', 'lenapass123'); await y.fill('#pw2', 'lenapass123');
  await fillProfile(y);
  await Promise.all([y.waitForURL(/\/student$/), y.click('button:has-text("Create account")')]);
  await y.goto(B + '/student/steps/1'); await Promise.all([y.waitForURL(/complete/), y.click('button:has-text("Save my ID")')]);
  grantConsent('lena.d@student.example.org');
  await y.goto(B + '/student/steps/2'); await y.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await Promise.all([y.waitForURL(/complete/), y.click('button:has-text("Submit courses")')]);
  await sendDocs(y, 'first');
  const first = q("SELECT id, stored_name FROM files WHERE kind LIKE 'young_%'");
  check(first.length === 2 && first.every((f) => fs.existsSync(DATA + '/uploads/' + f.stored_name)), 'two documents stored');

  // Recommend, then the approver declines: student is sent back and uploads new documents.
  const j = await login(b, 'jkim@shastacollege.edu');
  await j.goto(B + '/admin/students?tab=young'); await j.waitForLoadState('networkidle');
  await j.locator('input[name="rec"][value="recommend"]').locator('xpath=..').click(); await j.fill('#n10r', 'Letter is generic.');
  await Promise.all([j.waitForURL(/done=young_rec/), j.click('button:has-text("Save recommendation")')]);
  const d = await login(b, 'dortiz@shastacollege.edu');
  await d.goto(B + '/admin/students?tab=young'); await d.waitForLoadState('networkidle');
  await d.locator('input[name="decision"][value="decline"]').locator('xpath=..').click(); await d.fill('#n10d', 'Ask your principal to name ENGL C1000.');
  await Promise.all([d.waitForURL(/done=young_declined/), d.click('button:has-text("Save decision")')]);
  check(q("SELECT 1 FROM files WHERE kind LIKE 'young_%'").length === 0 && first.every((f) => !fs.existsSync(DATA + '/uploads/' + f.stored_name)), 'declined: old documents deleted (database and disk)');
  await y.goto(B + '/student/steps/2'); await Promise.all([y.waitForURL(/complete/), y.click('button:has-text("Resubmit courses")')]);
  await sendDocs(y, 'second');
  const second = q("SELECT filename FROM files WHERE kind LIKE 'young_%' ORDER BY id");
  check(second.length === 2 && second.every((f) => f.filename.includes('second')), 'only the new documents remain');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
