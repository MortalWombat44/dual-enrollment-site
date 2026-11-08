// Super admin uploads Dual Enrollment courses (CSV or Excel) for a school + term; template downloads.
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const { DatabaseSync } = require('node:sqlite');
const { grantConsent } = require('./testlib');
const B = 'http://localhost:3100', DB = require('path').join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const r = d.prepare(q).all(...a); d.close(); return r; };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true })).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
async function upload(p, school, term, file, replace = false) {
  await p.goto(B + '/admin/courses'); await p.waitForLoadState('networkidle');
  const f = p.locator('form:has(input[name="file"])');
  await f.locator('select[name="school_id"]').selectOption({ label: school });
  await f.locator('select[name="term_id"]').selectOption({ label: term });
  await f.locator('input[name="file"]').setInputFiles(file);
  if (replace) await f.locator('input[name="replace"]').check();
  await Promise.all([p.waitForURL(/imported=|import_error=/), f.locator('button:has-text("Upload courses")').click()]);
  await p.locator('#import .flash').waitFor();
  return p.locator('#import .flash').innerText();
}
const anderson = (term) => sql(`SELECT code, title, units, period, teacher, active FROM courses c LEFT JOIN terms t ON t.id = c.offered_term_id
  WHERE kind = 'de' AND school_id = (SELECT id FROM schools WHERE name = 'Anderson High School') AND t.name IS ? ORDER BY code`, term);

(async () => {
  await fetch(B + '/signup');
  const b = await chromium.launch();
  const d = await login(b, 'dortiz@shastacollege.edu');
  // Templates.
  const x = await d.request.get(B + '/admin/courses/template?format=xlsx');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await x.body());
  check(x.status() === 200 && wb.worksheets[0].getRow(1).values.slice(1).join(',') === 'Code,Title,Units,Period,Teacher,Prerequisite', 'Excel template has the header row');
  const c = await d.request.get(B + '/admin/courses/template?format=csv');
  check(c.status() === 200 && (await c.text()).includes('Code,Title,Units,Period,Teacher,Prerequisite'), 'CSV template downloads');
  const jm = await login(b, 'jkim@shastacollege.edu');
  check((await jm.request.get(B + '/admin/courses/template?format=csv')).status() === 404, 'college admins cannot download the template');

  // Bad file: nothing imported, errors with line numbers.
  const bad = { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Code,Title,Units\nBIOL C1000,Biology,\nchem!,,4\n') };
  const errText = await upload(d, 'Anderson High School', 'Spring 2027', bad);
  check(/Nothing was imported/.test(errText) && /Line 2: needs units/.test(errText) && /Line 3: needs a course code/.test(errText), 'bad rows reported by line, nothing imported');
  check(anderson('Spring 2027').length === 0, 'no courses added from the bad file');

  // CSV for Anderson, Spring 2027 (quoted comma in a title, Excel BOM).
  const csv = '﻿Code,Title,Units,Period,Teacher,Prerequisite\r\nBIOL C1000,"Biology, General",4,3,Mr. Ames,\r\nHIST C1010,US History,3,5,TBD,ENGL C1000\r\n';
  const ok = await upload(d, 'Anderson High School', 'Spring 2027', { name: 'anderson.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  check(/2 added, 0 updated/.test(ok), `CSV upload: ${ok.split('.')[0]}`);
  check(anderson('Spring 2027').map((r) => `${r.code}|${r.title}|${r.period}`).join(';') === 'BIOL C1000|Biology, General|3;HIST C1010|US History|5', 'rows saved for Anderson, Spring 2027');

  // Excel: update BIOL (same code + period), replace list (HIST removed).
  const w2 = new ExcelJS.Workbook(); const s2 = w2.addWorksheet('Courses');
  s2.addRow(['Code', 'Title', 'Units', 'Period', 'Teacher', 'Prerequisite']); s2.addRow(['BIOL C1000', 'Biology, General', 4, 3, 'Ms. Reyes', '']);
  const xl = await upload(d, 'Anderson High School', 'Spring 2027', { name: 'anderson.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await w2.xlsx.writeBuffer()) }, true);
  check(/0 added, 1 updated, 1 removed/.test(xl), `Excel upload with replace: ${xl.split('.')[0]}`);
  const rows = anderson('Spring 2027');
  check(rows.find((r) => r.code === 'BIOL C1000').teacher === 'Ms. Reyes' && rows.find((r) => r.code === 'HIST C1010').active === 0, 'teacher updated; HIST removed from new requests');
  check(sql("SELECT COUNT(*) n FROM courses WHERE kind = 'de' AND code = 'PSYC C1000' AND school_id = (SELECT id FROM schools WHERE name = 'Anderson High School') AND active = 1")[0].n === 1, 'every-term courses untouched by a Spring upload');

  // Student at Anderson: BIOL offered Spring only.
  const J = 'jamie.l@student.andersonhigh.org';
  const s = await login(b, J);
  await s.goto(B + '/student/steps/1'); await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  grantConsent(J);
  await s.goto(B + '/student/steps/2'); await s.waitForLoadState('networkidle');
  check(await s.locator('[data-kind="de"] >> text=Spring 2027 only').count() === 1, 'student sees the section is Spring 2027 only');
  check(await s.locator('[data-kind="de"] >> text=HIST C1010').count() === 0, 'removed section not offered');
  await s.click('[data-kind="de"] label:has-text("BIOL C1000")');
  const opts = await s.locator('select[aria-label^="Term for BIOL C1000"] option').allInnerTexts();
  check(opts.join() === 'Spring 2027', `term choice limited to Spring (${opts.join()})`);
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
