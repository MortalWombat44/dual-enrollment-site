// Test helper: mark parent consent signed directly in the database (for tests that aren't about consent).
const { DatabaseSync } = require('node:sqlite');
exports.grantConsent = (email) => {
  const d = new DatabaseSync(require('path').join(__dirname, '..', 'data', 'de.sqlite'));
  d.prepare(`INSERT OR REPLACE INTO step_progress (student_id, step_id, status, completed_at, seen, data)
    SELECT id, 3, 'complete', ?, 1, '{"method":"esign","signer":"Test Parent"}' FROM users WHERE email = ?`).run(new Date().toISOString(), email);
  d.close();
};
// Test helper: type a Concurrent Enrollment class into the course picker (free entry).
exports.addCe = async (page, code, units, termLabel) => {
  await page.click('button:has-text("Add a concurrent class")');
  const row = page.locator('.ce-row').last();
  await row.locator('input[name="ce_code"]').fill(code);
  await row.locator('input[name="ce_units"]').fill(String(units));
  if (termLabel) await row.locator('select[name="ce_term"]').selectOption({ label: termLabel });
};
// Test helper: fill the sign-up profile fields (date of birth, phone, address; 12th-grade plans if shown).
exports.fillProfile = async (page, dob = '2010-03-10') => {
  await page.fill('#dob', dob); await page.fill('#phone', '530-555-0199');
  await page.fill('#address', '1 Test Way'); await page.fill('#city', 'Redding'); await page.fill('#zip', '96001');
  if (await page.locator('input[name="plans"][value="yes"]').count()) await page.locator('input[name="plans"][value="yes"]').check();
};
// Test helper: complete College review & clear units (verify the three Colleague screens, keep or fill the ID).
exports.clearUnits = async (page) => {
  const sid = page.locator('input[name="student_number"]#cr_sid');
  if (!(await sid.inputValue())) await sid.fill('0499' + String(Date.now()).slice(-4));
  for (const n of ['v_sacp', 'v_rgpe', 'v_stal']) await page.locator(`input[name="${n}"]`).check();
  await page.click('button:has-text("All verified & units cleared in Colleague")');
};
