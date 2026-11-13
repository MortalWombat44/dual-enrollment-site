// Parent consent: sign by typing a name (shown in a cursive script) instead of drawing.
const { chromium, devices } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const B = 'http://localhost:3100', DB = path.join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const seen = (p, sel) => p.waitForSelector(sel, { timeout: 8000 }).then(() => true, () => false);

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const jamie = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await jamie.goto(B + '/login'); await jamie.fill('#email', 'jamie.l@student.andersonhigh.org'); await jamie.fill('#password', 'shasta2027');
  await Promise.all([jamie.waitForURL((u) => !u.pathname.startsWith('/login')), jamie.click('button:has-text("Sign in")')]);
  await jamie.goto(B + '/student/steps/1'); await jamie.fill('#sid', 'S18234567');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Save my ID")')]);
  await jamie.goto(B + '/student/steps/3');
  await jamie.fill('#pfirst', 'Chris'); await jamie.fill('#plast', 'Lee'); await jamie.fill('#pemail', 'chris.lee@example.com');
  await Promise.all([jamie.waitForURL(/invited=/), jamie.click('button:has-text("Create invite link")')]);
  const link = (await jamie.locator('code').first().innerText()).trim();

  // The parent signs on a phone by typing.
  const par = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await par.goto(link); await par.fill('#pw', 'parentpass1'); await par.fill('#pw2', 'parentpass1');
  await Promise.all([par.waitForURL(/\/parent/), par.click('button:has-text("Set password")')]);
  await par.click('a:has-text("Review & sign")'); await par.waitForURL(/parent\/consent/);
  check(await seen(par, '.sigpad canvas') && await seen(par, 'label.seg-opt:has-text("Type")'), 'consent offers Draw (default) and Type');
  await par.locator('label:has-text("legal guardian")').click();
  check(await par.locator('button:has-text("Submit consent")').isDisabled(), 'can’t submit until signed');
  await par.click('label.seg-opt:has-text("Type")');
  check(await seen(par, '[data-typed-signature] >> text=Chris Lee'), 'typed signature shows the parent’s name in script');
  const font = await par.locator('[data-typed-signature]').evaluate((el) => getComputedStyle(el).fontFamily);
  check(/Great Vibes/.test(font), 'shown in a cursive font');
  await par.fill('#signer', 'Christopher J. Lee');
  check(await seen(par, '[data-typed-signature] >> text=Christopher J. Lee'), 'signature follows the name as typed');
  await par.waitForFunction(() => document.querySelector('input[name="signature"]').value.startsWith('data:image/png'));
  await Promise.all([par.waitForURL(/signed=/), par.click('button:has-text("Submit consent")')]);

  const jid = sql("SELECT id FROM users WHERE email = 'jamie.l@student.andersonhigh.org'")[0].id;
  const step = sql('SELECT status, data FROM step_progress WHERE student_id = ? AND step_id = 3', jid)[0];
  const data = JSON.parse(step.data);
  check(step.status === 'complete' && data.signer === 'Christopher J. Lee' && data.sign_method === 'typed', 'consent recorded as typed, with the name');
  const file = sql('SELECT mime, size FROM files WHERE id = ?', data.file_id)[0];
  check(file.mime === 'image/png' && file.size > 1000, 'the typed signature is kept as an image');
  check(sql("SELECT COUNT(*) AS n FROM audit_events WHERE student_id = ? AND action = 'Parent consent signed' AND detail LIKE '%typed%'", jid)[0].n === 1, 'history says it was typed');
  await par.goto(`${B}/consent/${jid}`);
  check(await seen(par, 'text=e-signature (name typed)'), 'consent record says the name was typed');

  // Audit PDF.
  const adm = await (await b.newContext()).newPage();
  await adm.goto(B + '/login'); await adm.fill('#email', 'dortiz@shastacollege.edu'); await adm.fill('#password', 'shasta2027');
  await Promise.all([adm.waitForURL((u) => !u.pathname.startsWith('/login')), adm.click('button:has-text("Sign in")')]);
  const out = path.join(__dirname, 'typed-consent.pdf');
  fs.writeFileSync(out, await (await adm.request.get(`${B}/admin/audit.pdf?student=${jid}`)).body());
  const text = execFileSync('pdftotext', [out, '-']).toString().replace(/\s+/g, ' ');
  check(text.includes('Christopher J. Lee') && text.includes('Electronic signature (name typed, shown in script)'), 'audit PDF records the typed signature');
  const imgs = execFileSync('pdfimages', ['-list', out]).toString().trim().split('\n').slice(2).filter((l) => l.trim().split(/\s+/)[2] === 'image');
  check(imgs.length >= 1, 'audit PDF includes the signature image');

  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
