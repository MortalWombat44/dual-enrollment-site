// Prerequisite holds (more information / appointment), transcripts (student, high school staff, college admin),
// bulk transcript upload with matching, and the per-term history (admin panel + audit PDF).
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const B = 'http://localhost:3100', DB = path.join(__dirname, '..', 'data', 'de.sqlite');
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const sql = (q, ...a) => { const d = new DatabaseSync(DB); const st = d.prepare(q); const r = /^\s*select/i.test(q) ? st.all(...a) : st.run(...a); d.close(); return r; };
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test transcript\n') });

async function login(b, email) {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', 'shasta2027');
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
const submit = async (p, btn) => { await Promise.all([p.waitForURL(/done=|error=|sent=/), btn.click()]); await p.waitForLoadState('networkidle'); };

(async () => {
  await fetch(B + '/signup');
  const ethan = sql("SELECT id FROM users WHERE email = 'ethan.b@student.suhsd.net'")[0].id;
  const lucas = sql("SELECT id FROM users WHERE email = 'lucas.h@student.suhsd.net'")[0].id;
  check(sql('SELECT COUNT(*) AS n FROM audit_events WHERE student_id = ?', ethan)[0].n > 0, 'history backfilled from earlier records');
  const b = await chromium.launch();

  // --- Counselor: More information needed ---
  const jk = await login(b, 'jkim@shastacollege.edu');
  await jk.goto(`${B}/admin/students?tab=prereq&student=${ethan}`);
  const top = async (p, text) => (await p.locator('.kicker', { hasText: text }).first().boundingBox()).y;
  check(await top(jk, 'Prerequisite review') < await top(jk, 'College review & clear units'), 'college counselor: Prerequisite review is above College review');
  // Not a college counselor: College review stays first.
  const wasCounselor = sql("SELECT is_college_counselor AS c FROM users WHERE email = 'dortiz@shastacollege.edu'")[0].c;
  sql("UPDATE users SET is_college_counselor = 0 WHERE email = 'dortiz@shastacollege.edu'");
  const nc = await login(b, 'dortiz@shastacollege.edu');
  await nc.goto(`${B}/admin/students?tab=prereq&student=${ethan}`);
  check(await top(nc, 'College review & clear units') < await top(nc, 'Prerequisite review'), 'other admins: College review stays on top');
  sql("UPDATE users SET is_college_counselor = ? WHERE email = 'dortiz@shastacollege.edu'", wasCounselor);
  const math = jk.locator('[data-prereq^="MATH 13"]');
  check(await math.count() === 1, 'MATH 13 in Ethan’s prerequisite review');
  check(await math.locator('input[value="info"]').count() === 1 && await math.locator('input[value="appointment"]').count() === 1, 'four choices: approve, decline, more info, appointment');
  await math.locator('input[value="info"]').locator('xpath=..').click();
  await submit(jk, jk.locator('button:has-text("Save decisions")'));
  check(await seen(jk, 'text=Say what information you need'), 'more information needs a note');
  await jk.locator('[data-prereq^="MATH 13"] input[value="info"]').locator('xpath=..').click();
  await jk.fill('#n8', 'Please send your latest transcript.');
  await submit(jk, jk.locator('button:has-text("Save decisions")'));
  check(await seen(jk, 'text=Classes on hold leave the queue'), 'hold saved');
  check(sql("SELECT prereq_hold FROM course_requests r JOIN courses c ON c.id = r.course_id WHERE r.student_id = ? AND c.code = 'MATH 13'", ethan)[0].prereq_hold === 'info', 'hold stored on the class');
  await jk.goto(`${B}/admin/students?tab=prereq`);
  check(!(await jk.locator(`a[href*="student=${ethan}"]`).count()), 'Ethan left the Prerequisites queue');
  check(await seen(jk, 'a:has-text("waiting on student · 1")'), 'Waiting on student tab shows');
  await jk.goto(`${B}/admin/students?tab=prereqwait`);
  check(await jk.locator('table').getByText('Ethan Brooks').count() === 1 && await seen(jk, 'td >> text=Prerequisite: More information needed'), 'Ethan listed as waiting on student, with the hold as his step');

  // --- Student answers with a message + transcript ---
  const st = await login(b, 'ethan.b@student.suhsd.net');
  check(await seen(st, '[data-hold="info"] >> text=Prerequisite: More information needed'), 'student dashboard shows the hold');
  await st.goto(B + '/student/steps/8');
  check(await seen(st, 'text=Please send your latest transcript.'), 'student sees the counselor note');
  const form = st.locator('[data-hold-form="MATH 13"]');
  await form.locator('textarea[name="reply"]').fill('Attached my fall transcript.');
  await form.locator('input[name="transcript"]').setInputFiles(pdf('ethan-fall.pdf'));
  await Promise.all([st.waitForURL(/sent=info/), form.locator('button:has-text("Send to the counselor")').click()]);
  check(await seen(st, 'text=Your prerequisite review is back with the counselor'), 'student sent it back');
  check(!sql("SELECT prereq_hold FROM course_requests r JOIN courses c ON c.id = r.course_id WHERE r.student_id = ? AND c.code = 'MATH 13'", ethan)[0].prereq_hold, 'hold cleared');
  check(await st.locator('a:has-text("ethan-fall.pdf")').count() === 1, 'student sees their transcript listed');
  check(sql("SELECT COUNT(*) AS n FROM notifications WHERE kind = 'prereq' AND student_id = ?", ethan)[0].n >= 1, 'counselor notified');

  await jk.goto(`${B}/admin/students?tab=prereq&student=${ethan}`);
  check(await seen(jk, '[data-reply] >> text=Attached my fall transcript.'), 'counselor sees the reply');
  check(await seen(jk, '[data-transcripts] >> text=ethan-fall.pdf') && await jk.locator('[data-transcripts] .tag:has-text("New")').count() === 1, 'counselor sees the transcript, marked New');

  // --- Appointment required, student replies (stays on hold), admin puts it back ---
  await jk.locator('[data-prereq^="MATH 13"] input[value="appointment"]').locator('xpath=..').click();
  await submit(jk, jk.locator('button:has-text("Save decisions")'));
  check(await seen(jk, 'text=Classes on hold leave the queue'), 'appointment hold saved (no note needed)');
  await st.goto(B + '/student/steps/8');
  check(await seen(st, 'text=Make an appointment with a Shasta College counselor'), 'student told to make an appointment');
  await st.locator('[data-hold-form="MATH 13"] textarea[name="reply"]').fill('Booked for Nov 20 at 3pm.');
  await Promise.all([st.waitForURL(/sent=appointment/), st.locator('[data-hold-form="MATH 13"] button').click()]);
  check(sql("SELECT prereq_hold FROM course_requests r JOIN courses c ON c.id = r.course_id WHERE r.student_id = ? AND c.code = 'MATH 13'", ethan)[0].prereq_hold === 'appointment', 'appointment hold stays after the reply');
  await jk.goto(`${B}/admin/students?tab=prereqwait&student=${ethan}`);
  check(await seen(jk, '[data-reply] >> text=Booked for Nov 20'), 'counselor sees the appointment reply');
  await submit(jk, jk.locator('button:has-text("Appointment done: back to queue")'));
  check(await seen(jk, 'text=Back in the Prerequisites queue.'), 'appointment done puts it back in the queue');
  await jk.goto(`${B}/admin/students?tab=prereq&student=${ethan}`);
  await jk.locator('[data-prereq^="MATH 13"] input[value="approve"]').locator('xpath=..').click();
  await jk.locator('input[name="ncws"]').check();
  await submit(jk, jk.locator('button:has-text("Save decisions")'));
  check(await seen(jk, 'text=Prerequisite decisions saved.'), 'approved after the appointment');

  // --- History in the panel ---
  await jk.goto(`${B}/admin/students?tab=all&student=${ethan}`);
  const hist = jk.locator('[data-history]');
  for (const t of ['Prerequisite: More information needed: MATH 13', 'Answered the prerequisite hold on MATH 13', 'Uploaded a transcript',
    'Prerequisite: Appointment with a college counselor required: MATH 13', 'back in the counselor queue', 'Prerequisite approved for MATH 13']) {
    check(await hist.getByText(t, { exact: false }).count() > 0, `history: ${t}`);
  }
  check(await hist.locator('summary', { hasText: 'Spring 2027' }).count() === 1, 'history grouped by term');
  check(await hist.getByText('Jordan Kim (College counselor)', { exact: false }).count() > 0, 'history names who did it, with role');

  // --- High school staff upload a transcript for Lucas ---
  const hs = await login(b, 'ralvarez@suhsd.net');
  await hs.goto(`${B}/counselor?student=${lucas}&tab=incomplete`);
  await hs.goto(`${B}/counselor?student=${lucas}`);
  await hs.locator('[data-transcripts] input[name="transcript"]').setInputFiles(pdf('lucas-hs.pdf'));
  await Promise.all([hs.waitForURL(/done=transcript/), hs.locator('[data-transcripts] button:has-text("Upload transcript")').click()]);
  check(await seen(hs, 'text=Transcript sent to Shasta College'), 'high school staff uploaded a transcript');
  await jk.goto(`${B}/admin/students?tab=all&student=${lucas}`);
  check(await seen(jk, '[data-transcripts] >> text=lucas-hs.pdf') && await seen(jk, '[data-transcripts] >> text=(high school)'), 'admin sees it, from the high school');

  // --- College admin uploads for a student ---
  await jk.locator('[data-transcripts] input[name="transcript"]').setInputFiles(pdf('lucas-college.pdf'));
  await submit(jk, jk.locator('button:has-text("Upload for student")'));
  check(await seen(jk, 'text=Transcript added.') && await seen(jk, '[data-transcripts] >> text=lucas-college.pdf'), 'college admin uploaded on the student’s behalf');

  // --- Bulk upload ---
  const sa = await login(b, 'dortiz@shastacollege.edu');

  await sa.goto(B + '/admin/transcripts');
  await sa.locator('input[name="files"]').setInputFiles([
    pdf('0412893_transcript.pdf'),      // Maya by ID
    pdf('Brooks_Ethan_fall.pdf'),       // Ethan by name
    pdf('Sofya Nguyen transcript.pdf'), // closest: Sofia Nguyen
    pdf('scan0001.pdf'),                // nothing
    pdf('0412971.pdf'),                 // ID shared by two accounts
  ]);
  await sa.click('button:has-text("Upload transcripts")');
  await sa.waitForSelector('text=Done: 2 added to a student, 3 need a look', { timeout: 20000 });
  check(true, 'bulk upload: 2 assigned, 3 for review');
  await sa.waitForLoadState('networkidle');
  check(await sa.locator('[data-result="assigned"]', { hasText: 'Added to Maya Rivera' }).count() === 1, 'matched by Shasta College ID');
  check(await sa.locator('[data-result="assigned"]', { hasText: 'Added to Ethan Brooks' }).count() === 1, 'matched by name');
  await sa.goto(B + '/admin/transcripts');
  check(await seen(sa, '[data-inbox="Sofya Nguyen transcript.pdf"] >> text=Closest match: Sofia Nguyen'), 'closest match suggested');
  check(await seen(sa, '[data-inbox="0412971.pdf"] >> text=on 2 accounts'), 'shared ID asks staff to pick');
  check(await seen(sa, '[data-inbox="scan0001.pdf"] >> text=No student matched'), 'no match: staff pick');
  check(await seen(sa, '.admin-nav >> text=Transcripts · 3 to match'), 'nav shows how many need a match');
  await Promise.all([sa.waitForURL(/done=assigned/), sa.locator('[data-inbox="Sofya Nguyen transcript.pdf"] button:has-text("Add to Sofia Nguyen")').click()]);
  check(await seen(sa, 'text=Transcript added to the student’s record'), 'confirmed the suggestion');
  const ava = sql("SELECT id FROM users WHERE email = 'ava.t@student.suhsd.net'")[0].id;
  const pick = sa.locator('[data-inbox="scan0001.pdf"] input[name="pick"]');
  await pick.fill(`Thompson, Ava · ID 0412958 · Enterprise High School · #${ava}`);
  await Promise.all([sa.waitForURL(/done=assigned/), sa.locator('[data-inbox="scan0001.pdf"] button:has-text("Add")').last().click()]);
  check(true, 'picked a student from the list');
  sa.once('dialog', (d) => d.accept());
  await Promise.all([sa.waitForURL(/done=discarded/), sa.locator('[data-inbox="0412971.pdf"] button:has-text("Delete")').click()]);
  check(await seen(sa, 'text=Nothing waiting'), 'inbox empty after confirm, pick and delete');
  const count = (email) => sql("SELECT COUNT(*) AS n FROM files f JOIN users u ON u.id = f.student_id WHERE f.kind = 'transcript' AND u.email = ?", email)[0].n;
  check(count('maya.r@student.suhsd.net') === 1 && count('ethan.b@student.suhsd.net') === 2 && count('sofia.n@student.suhsd.net') === 1 && count('ava.t@student.suhsd.net') === 1, 'transcripts landed on the right students');
  check(sql('SELECT COUNT(*) AS n FROM transcript_inbox')[0].n === 0, 'inbox table empty');
  check(sql("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'Uploaded a transcript' AND detail LIKE '%confirmed by staff%'")[0].n === 2, 'history notes staff-confirmed matches');

  // --- Audit PDF has the history ---
  const res = await sa.request.get(`${B}/admin/audit.pdf?student=${ethan}`);
  const out = path.join(__dirname, 'ethan-history.pdf');
  fs.writeFileSync(out, await res.body());
  const text = execFileSync('pdftotext', [out, '-']).toString().replace(/\s+/g, ' ');
  check(text.includes('History') && text.includes('Prerequisite approved for MATH 13') && text.includes('Transcripts on file'), 'audit PDF includes history and transcripts');

  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
