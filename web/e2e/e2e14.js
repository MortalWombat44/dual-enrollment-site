const { fillProfile } = require('./testlib');
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = 'http://localhost:3100';
const OUT = __dirname + '/shots';
const check = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
const desk = { viewport: { width: 1280, height: 1000 } };
async function login(b, email, pw = 'shasta2027') {
  const p = await (await b.newContext(desk)).newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#password', pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button:has-text("Sign in")')]);
  return p;
}

(async () => {
  const b = await chromium.launch();
  // Student at Enterprise HS (high school approval required).
  const s = await (await b.newContext(desk)).newPage();
  await s.goto(B + '/signup');
  await s.fill('#first', 'Nora'); await s.fill('#last', 'Quinn'); await s.fill('#email', 'nora.q@student.example.org');
  await s.selectOption('#school', { label: 'Enterprise High School · Shasta Union HSD' });
  await s.selectOption('#grade', '11'); await s.selectOption('#grad', '2028');
  await s.fill('#sid', '0415555'); await s.fill('#pw', 'norapass11'); await s.fill('#pw2', 'norapass11');
  await fillProfile(s);
  await Promise.all([s.waitForURL(/\/student$/), s.click('button:has-text("Create account")')]);
  await s.goto(B + '/student/steps/1');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Save my ID")')]);
  await s.goto(B + '/student/steps/3');
  await s.fill('#pfirst', 'Dana'); await s.fill('#plast', 'Quinn'); await s.fill('#pemail', 'dana.quinn@example.com');
  await Promise.all([s.waitForURL(/invited=/), s.click('button:has-text("Create invite link")')]);
  const link = (await s.locator('code').first().innerText()).trim();

  // Parent signs with a finger on a phone.
  const pctx = await b.newContext({ ...devices['iPhone 13'] });
  const par = await pctx.newPage();
  await par.goto(link); await par.fill('#pw', 'parentpass1'); await par.fill('#pw2', 'parentpass1');
  await Promise.all([par.waitForURL(/\/parent/), par.click('button:has-text("Set password")')]);
  await par.click('a:has-text("Review & sign")');
  const box = await par.locator('.sigpad canvas').boundingBox();
  const cdp = await pctx.newCDPSession(par);
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push({ x: box.x + 30 + t * (box.width - 60), y: box.y + 95 - Math.sin(t * Math.PI * 3) * 28 * (1 - t * 0.5) }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
  for (const pt of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await par.locator('label:has-text("legal guardian")').click();
  await Promise.all([par.waitForURL(/signed=/), par.click('button:has-text("Submit consent")')]);
  await s.goto(B + '/student/steps/2');
  await s.click('[data-kind="de"] label:has-text("ENGL C1000")');
  await Promise.all([s.waitForURL(/complete/), s.click('button:has-text("Submit courses")')]);
  check(true, 'parent drew a signature on a phone');

  // High school staff approve & sign (drawn).
  const rosa = await login(b, 'ralvarez@suhsd.net');
  await Promise.all([rosa.waitForURL(/student=/), rosa.click('a.rowa:has-text("Nora Quinn")')]);
  await rosa.click('label.seg-opt:has-text("Draw")');
  await rosa.locator('.sigpad canvas').scrollIntoViewIfNeeded();
  const sb = await rosa.locator('.sigpad canvas').boundingBox();
  await rosa.mouse.move(sb.x + 30, sb.y + 120); await rosa.mouse.down();
  for (let i = 0; i <= 30; i++) await rosa.mouse.move(sb.x + 30 + i * 10, sb.y + 100 + Math.cos(i / 3) * 35);
  await rosa.mouse.up();
  await Promise.all([rosa.waitForURL(/done=approved/), rosa.click('button:has-text("Approve & sign digitally")')]);
  check(true, 'high school staff drew and signed');

  // Audit PDF for Nora.
  const tab = await login(b, 'dortiz@shastacollege.edu');
  const id = await tab.evaluate(async () => 0);
  await tab.goto(B + '/admin/audit?ids=0415555');
  const href = await tab.locator('a:has-text("Download PDF")').getAttribute('href');
  const res = await tab.request.get(B + href);
  fs.writeFileSync(__dirname + '/nora.pdf', await res.body());
  const text = execFileSync('pdftotext', ['-layout', __dirname + '/nora.pdf', '-']).toString();
  check(text.includes('Signed by: Dana Quinn') && text.includes('Electronic signature'), 'parent e-signature details in PDF');
  check(text.includes('approved and digitally signed by Rosa Alvarez'), 'school signature details in PDF');
  const imgs = execFileSync('pdfimages', ['-list', __dirname + '/nora.pdf']).toString().trim().split('\n').slice(2).filter((l) => l.trim().split(/\s+/)[2] === 'image');
  check(imgs.length === 2, `PDF contains ${imgs.length} signature images (parent + school)`);
  execFileSync('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '1', __dirname + '/nora.pdf', OUT + '/l1-nora-pdf']);
  await b.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
