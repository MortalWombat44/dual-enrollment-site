// College Review & Clear Units: verify ID (and fix it), SACP, RGPE, STAL, then "All verified & units cleared in Colleague".
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const j = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await j.goto(B + '/login'); await j.fill('#email', 'jkim@shastacollege.edu'); await j.fill('#password', 'shasta2027');
  await Promise.all([j.waitForURL(/admin/), j.click('button:has-text("Sign in")')]);
  const E = sql("SELECT id FROM users WHERE email = 'ethan.b@student.suhsd.net'")[0].id;
  await j.goto(B + `/admin/students?student=${E}`); await j.waitForLoadState('networkidle');
  check(await j.locator('a.seg-opt:has-text("College review")').count() === 1 && await j.locator('text=College review & clear units').count() > 0, 'step renamed College review & clear units');
  const form = j.locator('form:has(button:has-text("All verified & units cleared in Colleague"))');
  check(await form.locator('#cr_sid').inputValue() === '0412910', 'Shasta College ID shown for confirmation');
  for (const t of ['Program in SACP', 'Start date in RGPE', 'Cohort in STAL']) check(await form.locator(`label:has-text("${t}")`).count() === 1, `checklist: ${t}`);
  // Can't clear without the three checks (browser blocks it; the server also refuses).
  await form.locator('button:has-text("All verified")').click(); await j.waitForTimeout(600);
  check(!/done=cleared/.test(j.url()), 'cannot clear before checking SACP, RGPE and STAL');
  await form.locator('#cr_sid').fill('0412999');
  for (const n of ['v_sacp', 'v_rgpe', 'v_stal']) await form.locator(`input[name="${n}"]`).check();
  await Promise.all([j.waitForURL(/done=cleared/), form.locator('button:has-text("All verified")').click()]);
  check(sql('SELECT student_number FROM users WHERE id = ?', E)[0].student_number === '0412999', 'ID updated during review');
  const d = JSON.parse(sql('SELECT data FROM step_progress WHERE student_id = ? AND step_id = 7', E)[0].data);
  check(d.verified.sacp && d.verified.rgpe && d.verified.stal && d.verified.id_changed_from === '0412910', 'verification recorded (with the old ID)');
  // Send back still works without the checklist.
  const S = sql("SELECT id FROM users WHERE email = 'sofia.n@student.suhsd.net'")[0].id;
  await j.goto(B + `/admin/students?student=${S}`); await j.waitForLoadState('networkidle');
  await j.fill('#n7', 'PSY 1 is full.');
  await Promise.all([j.waitForURL(/done=sent_back/), j.click('button:has-text("Send back to student")')]);
  check(true, 'Send back works without checking the boxes');
  // Audit record.
  const dana = await (await b.newContext()).newPage();
  await dana.goto(B + '/login'); await dana.fill('#email', 'dortiz@shastacollege.edu'); await dana.fill('#password', 'shasta2027');
  await Promise.all([dana.waitForURL(/admin/), dana.click('button:has-text("Sign in")')]);
  fs.writeFileSync(__dirname + '/ethan.pdf', await (await dana.request.get(B + `/admin/audit.pdf?student=${E}`)).body());
  const text = execFileSync('pdftotext', [__dirname + '/ethan.pdf', '-']).toString().replace(/\s+/g, ' ');
  check(/Shasta College ID 0412999, Program \(SACP\), Start date \(RGPE\) and Cohort \(STAL\) verified in Colleague/.test(text), 'audit PDF records the verification');
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
