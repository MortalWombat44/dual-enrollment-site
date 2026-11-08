const { chromium, devices } = require('playwright');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const seen = (p, sel, t = 8000) => p.waitForSelector(sel, { timeout: t }).then(() => true, () => false);
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027', opts = desk) {
  const p = await (await b.newContext(opts)).newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}
async function draw(p, sel) {
  await p.locator(sel).scrollIntoViewIfNeeded();
  const box = await p.locator(sel).boundingBox();
  await p.mouse.move(box.x + 30, box.y + 120); await p.mouse.down();
  for (let i = 0; i <= 25; i++) await p.mouse.move(box.x + 30 + i * 12, box.y + 110 + Math.sin(i / 2.5) * 30);
  await p.mouse.up();
}

(async () => {
  const b = await chromium.launch();

  // HS staff: approve & sign digitally (typed, then saved, then drawn).
  const rosa = await login(b, 'ralvarez@suhsd.net');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Maya Rivera")')]);
  check(await seen(rosa, 'button:has-text("Approve & sign digitally")'), 'button says Approve & sign digitally');
  check(await rosa.locator('button:has-text("Approve & sign digitally")').isDisabled(), 'cannot approve before signing');
  await rosa.click('label.seg-opt:has-text("Type")');
  await rosa.fill('input[aria-label="Type your name"]', 'Rosa Alvarez');
  await rosa.waitForFunction(() => !document.querySelector('button[formaction], button')?.disabled || true);
  await rosa.waitForSelector('button:has-text("Approve & sign digitally"):not([disabled])');
  await rosa.screenshot({ path: OUT + '/k1-sign-typed.png', fullPage: true });
  await Promise.all([rosa.waitForURL(/done=approved/), rosa.click('button:has-text("Approve & sign digitally")')]);
  check(true, 'approved Maya with typed cursive signature');
  await rosa.goto(B + '/counselor');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Lucas Hart")')]);
  check(await seen(rosa, 'img[alt="Your saved signature"]'), 'saved signature offered next time');
  await Promise.all([rosa.waitForURL(/done=approved/), rosa.click('button:has-text("Approve & sign digitally")')]);
  check(true, 'approved Lucas with saved signature');
  await rosa.goto(B + '/counselor');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Ava Thompson")')]);
  await rosa.click('label.seg-opt:has-text("Draw")');
  await draw(rosa, '.sigpad canvas');
  await rosa.locator('input[name="save_signature"]').uncheck();
  await Promise.all([rosa.waitForURL(/done=approved/), rosa.click('button:has-text("Approve & sign digitally")')]);
  check(true, 'approved Ava with drawn signature');

  // Jamie's parent signs digitally (uploading a signed form is turned off).
  const jamie = await login(b, 'jamie.l@student.andersonhigh.org');
  await jamie.goto(B + '/student/steps/1');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Save my ID")')]);
  await jamie.goto(B + '/student/steps/3');
  await jamie.fill('#pfirst', 'Chris'); await jamie.fill('#plast', 'Lee'); await jamie.fill('#pemail', 'chris.lee@example.com');
  await Promise.all([jamie.waitForURL(/invited=/), jamie.click('button:has-text("Create invite link")')]);
  const link = (await jamie.locator('code').first().innerText()).trim();
  const par = await (await b.newContext(desk)).newPage();
  await par.goto(link); await par.fill('#pw', 'parentpass1'); await par.fill('#pw2', 'parentpass1');
  await Promise.all([par.waitForURL(/\/parent/), par.click('button:has-text("Set password")')]);
  await par.click('a:has-text("Review & sign")');
  const signed = await PDFDocument.create(); const pg = signed.addPage([612, 792]);
  pg.drawText('Signed consent form - Chris Lee', { x: 72, y: 700, size: 18, font: await signed.embedFont(StandardFonts.Helvetica) });
  fs.writeFileSync(__dirname + '/signed-form.pdf', await signed.save());
  // Uploading a signed form is turned off: digital signature only.
  check(await par.locator('text=Upload signed form').count() === 0 && await par.locator('input[type="file"]').count() === 0, 'consent page has no upload option');
  await draw(par, '.sigpad canvas');
  await par.locator('label:has-text("legal guardian")').click();
  await Promise.all([par.waitForURL(/signed=/), par.click('button:has-text("Submit consent")')]);
  await jamie.goto(B + '/student/steps/2');
  await jamie.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await Promise.all([jamie.waitForURL(/complete/), jamie.click('button:has-text("Submit courses")')]);
  check(true, 'parent signed digitally');

  // Super admin audit.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  await tab.click('.admin-nav >> text=Audit');
  await tab.fill('#ids', '0412893, 0412947\n0413002 9999999');
  await tab.locator('label:has-text("Spring 2027") input').check();
  await Promise.all([tab.waitForURL(/ids=/), tab.click('button:has-text("Find students")')]);
  check(await seen(tab, 'text=3 students found from 4 IDs'), 'IDs matched');
  check(await seen(tab, 'tr:has-text("9999999") >> text=No student with this ID'), 'unknown ID flagged');
  check(await seen(tab, 'tr:has-text("Maya Rivera") >> text=Signed'), 'HS signature status shown');
  check(await seen(tab, 'tr:has-text("Jamie Lee") >> td:has-text("Not required")'), 'HS approval not required at a CCAP school (Anderson)');
  await tab.screenshot({ path: OUT + '/k2-audit-page.png', fullPage: true });
  const href = await tab.locator('a:has-text("Download PDF")').getAttribute('href');
  const res = await tab.request.get(B + href);
  check(res.status() === 200 && res.headers()['content-type'] === 'application/pdf', 'PDF downloads');
  const bytes = await res.body();
  fs.writeFileSync(__dirname + '/audit.pdf', bytes);
  const doc = await PDFDocument.load(bytes);
  check(doc.getPageCount() >= 3, `PDF has ${doc.getPageCount()} pages (3 students)`);
  const text = execFileSync('pdftotext', ['-layout', __dirname + '/audit.pdf', '-']).toString();
  check(text.includes('Maya Rivera') && text.includes('Lucas Hart') && text.includes('Jamie Lee'), 'all three students in the PDF');
  check(text.includes('approved and digitally signed by Rosa Alvarez'), 'HS signature line present');
  check(text.includes('Signed by: Laura Rivera') && text.includes('Electronic signature'), 'parent consent details present');

  check(text.includes('ENGL C1000') && text.includes('TBD'), 'course requests with period/teacher');
  check(text.includes('not used at CCAP schools'), 'Jamie: HS approval not used at CCAP');
  execFileSync('pdftoppm', ['-png', '-r', '60', '-f', '1', '-l', '1', __dirname + '/audit.pdf', OUT + '/k3-audit-pdf-p1']);
  // Non-super admins can't get it.
  const jordan = await login(b, 'jkim@shastacollege.edu');
  const denied = await jordan.request.get(B + href);
  check(denied.status() === 403, 'college admin cannot download audit PDFs');

  for (const p of [rosa, tab]) if (p.errs.length) console.log('page errors:', p.errs);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
