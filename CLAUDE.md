# CLAUDE.md

Shasta College Dual Enrollment portal. Students, parents, high school staff and college admins move a student through the dual / concurrent enrollment steps (apply, parent consent, course selection, approvals, unit clearance, prerequisites, registration).

**The app is already built and in use. It is not a design handoff any more.** The root `README.md` is the original Claude Design handoff note ("CODING AGENTS: READ THIS FIRST"). Ignore its instructions to rebuild from the prototype. `project/`, `chats/` and `screenshots/` are the original design reference: use them for visual style only.

The owner is not a developer. Explain changes in plain language, and ask before changing a business rule they didn't mention.

## Where things are

| Path | What |
| --- | --- |
| `web/` | The app (Next.js 15 App Router, React 19, TypeScript). **Run every npm command from here.** |
| `web/README.md` | **The source of truth for business rules**: every step, role, flag and workflow rule. Update it whenever behavior changes. |
| `web/e2e/` | Playwright end-to-end tests and `run.sh` |
| `docs/College-Admin-Guide.pdf` | Staff guide (built from `docs/guide-src/`). Update it when admin-facing behavior changes. |
| `render.yaml` | Render deploy (free plan, `rootDir: web`) |

## Commands (in `web/`)

```bash
npm install
npm run dev          # http://localhost:3000; DB is created and seeded on the first request
npm run build        # production build. Also the best type and lint check
npm run typecheck    # tsc --noEmit
npm run db:reset     # delete ./data (database + uploads); it reseeds on the next request
./e2e/run.sh         # build, then the full e2e suite on :3100 (fresh DB per test), about 10–15 minutes
./e2e/run.sh 6 18    # only e2e6.js and e2e18.js
SKIP_BUILD=1 ./e2e/run.sh 26   # reuse the last build
```

Requirements:
- Node ≥ 22.13: the app uses the built-in `node:sqlite`, so there are no native modules.
- The e2e tests use the preinstalled `playwright` package plus `pdftotext`, `pdfimages`, `pdftoppm` (poppler) and `unzip`.

Demo accounts:
- The password for all of them is `shasta2027`. The list is in `web/README.md`.
- The login page shows them only in dev or with `SHOW_DEMO_ACCOUNTS=1`.

Before committing a behavior change:
1. Run `npm run build`.
2. Run the e2e tests that touch the area. Run the whole suite for workflow changes.
3. Update `web/README.md`.
4. If admins are affected, update the guide.

## Architecture

- **Pages:**
  - `web/app/**/page.tsx` are server components with `export const dynamic = 'force-dynamic'`.
  - They read the DB directly through `lib/`.
  - Mutations are **server actions** in `lib/*-actions.ts` (`'use server'`). Most use `<form action={...}>` plus `redirect()` with a `?msg=` / `?err=` flash.
  - `CourseEditorClient` is the in-place (no reload) exception: its actions return `{ ok, course | error }`.
- **Auth:**
  - `lib/auth.ts` provides cookie sessions (the `sessions` table), `currentUser()`, `requireRole(...)` and `requireAdmin('college' | 'super')`.
  - **Every server action and page must check its role itself.**
  - `lib/access.ts` (`canSeeStudent`, `primarySchoolIds`) handles per-student visibility.
- **Roles:**
  - `users.role` is one of `student`, `parent`, `counselor` (shown as High School Staff; any staff type) or `admin`.
  - Admins have `admin_level` college or super.
  - Admin flags:
    - `is_college_counselor`: decides prerequisites and recommends young students.
    - `is_young_approver`
    - `is_young_lead` / `is_homeschool_lead`: receive notifications.
  - Primary schools are in `admin_schools`.
- **Database** (`lib/db.ts`):
  - SQLite in `DE_DATA_DIR` (default `web/data/de.sqlite`); uploads go in `data/uploads/`.
  - `db()` opens the DB once and runs the following in order:
    1. `SCHEMA` (all `CREATE TABLE IF NOT EXISTS`)
    2. `migrate()`
    3. `seed()` (only on an empty DB)
    4. Idempotent startup fixes: `removeRetiredSeedAccounts`, `sweepYoungDocs`, `backfillRegistrations`, `ensureHomeschool`
  - Use `tx(() => ...)` for multi-statement writes.
- **Workflow engine** (`lib/workflow.ts`):
  - `getProgress(studentId)` is the one place a student's step statuses are computed. **For lists, use `getProgressMany(ids)`** (a handful of queries in total); calling `getProgress` in a loop made the Students page take 4 seconds at 2,000 students.
  - Most steps are stored in `step_progress`. Several are **derived**:
    - High school approval (4): every `course_requests.hs_status = 'approved'`. CCAP schools never need it. Unlisted ("Other") schools and homeschool (`namesApprover(school)`) use an approver the student names, who approves by link; a college admin reviews that person (`users.hs_approver_status`, `lib/approver-review.ts`), and `clearUnits` refuses until it's `'approved'`.
    - Prerequisite review (8): every request with `needs_prereq` has `prereq_status = 'approved'`. It runs alongside step 7, not after it, so a student's `next` step is often 7 even when 8 needs them.
      A class can be on hold (`course_requests.prereq_hold` = `'info'` | `'appointment'`). When every remaining class is held, step 8 gets `hold` and the student shows in the "waiting on student" tab instead of the counselor queue.
    - College review & clear units (7): auto-complete through `unit_clearances` (the CCAP "cleared for max units" option).
    - Register (5): a `registrations` row for every term the student has requests in. Shows Ready / Overdue after `REGISTER_GRACE_DAYS`.
    - Parent consent (3): skipped when `isAdult` (18+ today, Pacific time, from DOB).
    - Young steps (9, 10): only when grade ≤ 8. The affidavit step (11) is only for homeschool.
  - Use `stepStatusLabel` / `stepOnLabel` for wording. Don't hand-write status text.
- **Course requests:**
  - `course_requests` has the key `(student_id, course_id, term_id)`. High school approval, prerequisite decisions and archiving are **per class per term**.
  - Archived requests (`archived_at`, `archived_reason`) leave the workflow but stay visible to staff.
  - `addRequest` un-archives a request.
- **Courses:**
  - `courses.kind` is `de` (per school, `school_id`) or `ce` (Concurrent).
  - CE has a stock list (`custom = 0`) plus student free entry (`custom = 1`).
  - `active = 0` means removed: hidden from new requests, kept on existing ones.
  - `offered_term_id` limits a DE section to one term.
- **Notifications:**
  - `lib/notify.ts` (`notifyUsers`, `notifyLeads`, `adminsForStudent`) writes to the `notifications` table and emails through Resend when it's configured (`lib/mail.ts`).
  - Without email, links are logged, and shown on screen in demo mode.
  - Account emails (reset links, invites, test email) are in `lib/account-mail.ts`. **Reset links go only to the email on file** (`sendResetLink` reads it from the database); never email or display a reset link anywhere else outside demo mode.
  - Build links with `siteOrigin()` from `lib/site.ts` (uses `SITE_URL`); don't read the Host header directly.
- **Other modules:**
  - PDFs: `lib/audit-pdf.ts` (pdf-lib).
  - ZIP export plus delayed deletion: `lib/file-archive.ts`. `web/instrumentation.ts` runs `runDueDeletions` every 30 seconds.
  - Course CSV/Excel import: `lib/course-import.ts` (exceljs).
  - Outside high school approver links: `lib/approver-links.ts` (stores only a SHA-256 token hash).
  - Transcripts (prerequisite review): `lib/transcripts.ts` (`addTranscript`, `releaseHolds`, file-name matching for bulk upload, the `transcript_inbox` table). The bulk upload posts one file per request to the route `app/admin/transcripts/upload/route.ts`, so the server action size limit doesn't apply.
- **History / audit trail** (`lib/audit.ts`, table `audit_events`):
  - **Every action that changes a student's record must call `logEvent(studentId, actorOf(me), action, detail, terms)`.**
  - `terms`: the class's term(s), `'student'` for step-level events (files them under every term the student has classes in), or omit for account-wide events.
  - Actor name and role are stored as text at the time. Events are never edited.
  - `addRequest(..., by)` logs class requests itself; pass the actor.

## Step ids ≠ step order

Ids were added over time.
- **Order:** 1 CCCApply → 3 Parent consent → 2 Course selection → 4 HS approval → 11 Private School Affidavit → 9 Young documents → 10 Young review → 7 College review & clear units → 8 Prerequisite review → 5 Register.
- Step 6 (Textbooks & Canvas) is commented out in `STEP_DEFS`.
- Always order by `STEP_DEFS` / `STEP_ORDER` / `stepIndex()` from `lib/db.ts`. Never order by id.

## Gotchas (each of these has bitten before)

- **Schema changes:**
  - Add the column to `SCHEMA` **and** add an `ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info` in `migrate()`. Existing databases (including production) never rerun `SCHEMA` for existing tables.
  - Changing a CHECK constraint or primary key means rebuilding the table (see the `course_requests_new` migration).
- **`step_progress.status` CHECK:**
  - It only allows `'complete'` and `'changes_requested'`.
  - Put extra review state in its own table (as `young_reviews`, `affidavits` and `nudges` do). Don't add new status strings.
- **node:sqlite rows:** these are null-prototype objects. `db()` copies them into plain objects so they can be passed to client components. Always go through `db()`; never use a raw `DatabaseSync`.
- **`'use server'` files may export only async functions:**
  - Put shared sync helpers in a plain module (e.g. `lib/course-fields.ts`).
  - Server-only modules start with `import 'server-only'`.
- **Submit buttons:** a submit button's `name`/`value` isn't reliably sent to server actions. Use a hidden input (or the button's `formAction`), and `formNoValidate` on "send back" buttons inside forms with required fields.
- **Client forms keyed by student:** client forms that hold per-student state need a `key` that includes the student (or the data). Otherwise React keeps stale state when the admin side panel switches students.
- **Dates:**
  - "Today" means Pacific time (`lib/retire.ts`). `DE_TODAY=YYYY-MM-DD` overrides it for testing.
  - Stored timestamps are ISO strings. Compare them with SQLite `datetime()` when mixing in `CURRENT_TIMESTAMP` values.
- **Upload size:** the server action body limit is 22 MB (`next.config.mjs`), enough for two 10 MB uploads.
- **CSV exports:** use `csvCell` from `lib/csv.ts` for every cell (it neutralizes spreadsheet formulas).
- **Retired / disabled students** (`users.disabled = 1`) stay out of staff queues, rosters and reports; only the admin "All students" tab lists them.
- **Staff-only features** are deliberately not shown to students: the CCAP max-units option, staff names on approvals, nudges. Keep them out of student and parent views.
- **Writing style:** UI text is plain language for students and parents. Use short sentences and no jargon. College systems (Colleague, SACP, RGPE, STAL, NCWS, myShasta, CCCApply) appear only where staff act on them.

## E2E tests (`web/e2e/`)

- Each `e2eN.js` is a standalone Node script.
  - It drives Chromium against `http://localhost:3100`, and sometimes reads or writes the DB directly at `web/data/de.sqlite` to set up state.
  - It prints `ok - ...` lines and throws on failure.
- A test can start the server with extra settings by adding `e2eN.env` (e2e28 connects a stand-in mail server this way).
- `testlib.js` has the helpers: `grantConsent`, `addCe`, `fillProfile`, `clearUnits`.
- Each test expects a **freshly seeded database** (`run.sh` restarts the server on an empty `data/` before every test), so tests never depend on each other's DB changes. The one file dependency: e2e13 writes `signed-form.pdf`, which e2e15, 17, 21 and 22 use, so keep the order in `run.sh`.
- Wait for the right thing after a click that navigates or submits a server action:
  - `waitForURL`
  - `waitForLoadState('networkidle')`
  - a `.flash`
  - (otherwise the test reads the old page)
- Playwright can't attach files from non-ASCII paths. Pass a `{ name, mimeType, buffer }` instead.
- Output (`shots/`, PDFs, ZIPs, logs) is gitignored.
- Add a new `e2eN.js` for each feature and add its number to the list in `run.sh`.

## College Admin guide (`docs/guide-src/`)

- `build.py` writes `guide.html` from content in Python, using SVG flowcharts from `diagrams.py` and the styles in `guide.css`.
- `render.js` prints it with Chromium.
- `make.py` does a two-pass contents page-number fill, adds footers, and writes `docs/College-Admin-Guide.pdf`.
- Run it with `cd docs/guide-src && python3 make.py`. It needs `pypdf`, `reportlab` and `playwright` from Node.
- No screenshots in the guide (owner's choice): use flowcharts and tables.
- After rebuilding, check the pages for clipped diagram labels and pages that spill over.

## Deploy and production notes

- Render free plan: the disk is wiped on every restart or redeploy, so the DB goes back to demo data. Real use needs a paid plan, a persistent disk and `DE_DATA_DIR` set to its mount path.
- Before real use:
  - Remove `SHOW_DEMO_ACCOUNTS=1`.
  - Set `RESEND_API_KEY`, `MAIL_FROM` and `SITE_URL` so emails send (see "Connecting email" in `web/README.md`; the Users page has a test button).
  - Fill in `CONSENT_REVOKE_EMAIL` and `COUNSELING_APPOINTMENT_URL` in `lib/constants.ts`. They are still placeholders, and so is the contact on the guide's back page.
- No named accounts with passwords are seeded in code. Real admins are created from Users.

## Git

- The code is proprietary (see `LICENSE`, all rights reserved) and the GitHub repository is private. Don't add open-source license files or make it public.

- Work on `main` unless told otherwise. Commit and push only when the owner asks, or as part of a finished change they requested.
- Don't put model names in commits or code.
