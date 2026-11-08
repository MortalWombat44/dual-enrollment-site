# Shasta College Dual Enrollment

A Next.js 15 app built from the Claude Design handoff in `../project/Dual Enrollment Steps.dc.html`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Requires Node 22.13 or later. It uses the built-in `node:sqlite`, so there are no native dependencies.
The database lives in `./data/de.sqlite` and is created and seeded on first request. Uploads are stored in `./data/uploads`.
To start over, run `npm run db:reset`. Set `DE_DATA_DIR` to store data somewhere else.

Demo accounts (password `shasta2027`):

| Role | Email |
| --- | --- |
| Student (step 4, in review) | maya.r@student.suhsd.net |
| Student (not started, no parent yet) | jamie.l@student.andersonhigh.org |
| Parent of Maya (Maya shares her progress) | laura.rivera@gmail.com |
| High School Staff, Enterprise HS (Non-CCAP) | ralvarez@suhsd.net |
| Super admin + Young Student Approver | dortiz@shastacollege.edu |
| College admin + college counselor (primary school: Enterprise HS) | jkim@shastacollege.edu |
| Super admin (password `ShastaDE2027`) | tmiller@shastacollege.edu |

## Screens → routes

| Design | Route |
| --- | --- |
| 2a Student dashboard | `/student` |
| 1b Step detail / moment of completion | `/student/steps/[1-6]` (also holds each step's form) |
| 2d Step complete (desktop) · 1c on phones | `/student/steps/[n]/complete` |
| 1a Dashboard with 4-up grid + contact cell | `/parent` (parent's view of their student) |
| 2b Parent consent: draw-to-sign or upload | `/parent/consent` |
| 2c Counselor review queue | `/counselor` |
| Admin student queue (counselor-style) | `/admin/students` |
| 3a Users + Add user (super admin) | `/admin/users` |
| 3b Schools + Add school | `/admin/schools` |
| 3c School designation + step rules | `/admin/schools/[id]` |
| Concurrent Enrollment course list; links to each school's Dual Enrollment list (super admin) | `/admin/courses` |
| Terms: several at once, registration dates, registration allowed on/off (super admin) | `/admin/terms` |
| Admin reports (Clear units wait times and counts) | `/admin/reports` |
| Roster by school, by class or by teacher (+ CSV) | `/admin/roster` |
| Audit PDFs: consent + course requests by Shasta College ID and term (super admin) | `/admin/audit` |
| Student sign-up (picks their high school) | `/signup` |

## Steps (in order)

1. Apply on CCCApply: Shasta College ID (student, once ever)
2. Parent consent (parent, invited by the student). A one-time, general consent, not tied to specific classes. Course selection stays locked until it's signed.
3. Course selection (student)
4. High school approval: **Non-CCAP schools only** (never at CCAP schools; set by designation, not editable). Each class is approved **per class, per term**: staff approve or decline each pending class and sign digitally once for the batch. Classes already approved stay approved; adding a class (e.g. for next term) opens the step again for just that class. Declining needs a note and sends the student back to Course selection. Students and parents don't see staff names; they're told to check with their high school counselor.
5. Young student documents (8th grade and below only): a recent transcript or report card and a letter from the principal saying how the student will benefit from the specific course(s).
6. Young student review (8th grade and below only): a **college counselor** recommends (or not) with feedback, then a different admin flagged **Young Student Approver** approves or declines. Approving moves the student to Clear units; declining sends them back to Course selection with the note (documents are sent again, since the letter is course-specific). Admins see a **Young students** tab on `/admin/students` only while someone is waiting.
7. Clear units (college admin). Runs again whenever the student's classes change.
8. Prerequisite review (college counselor). Only shown when a requested class has a prerequisite.
9. Register for classes: every student registers themselves in myShasta, then confirms here

Textbooks & Canvas is switched off for now (commented out in `STEP_DEFS` in `lib/db.ts`; its page and wording are still in the code).

Step ids in the database don't follow this order (Clear units is id 7, Prerequisite review id 8), so always use `STEP_DEFS` / `STEP_ORDER` in `lib/db.ts` for ordering.

## Admin levels

- **College admin**: the Students page for every school. Can clear units, move any step forward (mark complete) or back (reopen it and every later step), request or remove classes for a student, and move a student to another school.
- **College counselor**: a flag on any admin. Only these admins can approve or decline classes with a prerequisite. A declined class comes off the request; if nothing is left, the student goes back to Course selection with the note.
- Whenever a reviewer sends classes back, Course selection reopens and the new classes go through High school approval, Clear units and Prerequisite review again.
- **Super admin**: everything above, plus Users (create users and admins, set admin level, the college counselor flag and the Young Student Approver flag), Schools (add schools, edit step rules) and Terms (registration date).

## Terms, accounts and flags

- **Terms:** a super admin can have several terms open at once. Students pick a term for every class they request, from the terms with **registration allowed**. Usual unit limits are per term: CCAP students 15; non-CCAP students 11, or 7 in a term marked Summer on the Terms page. Students are never blocked from going over; they, their counselor and the admin clearing units see a note (limits live in `lib/constants.ts`). If registration is turned off for a term, classes already in it are flagged to the student, counselor and the admin clearing units. The Register step follows the earliest registration date among the student's terms.
- **Sign-up:** students create their own account at `/signup` and pick their high school. The Shasta College ID is optional there and can be added later in Account.
- **Shared IDs:** a Shasta College ID on more than one student account is flagged in the admin Students page (Shared IDs tab). Admins can correct the ID from the side panel.
- **High school changes:** students request a change from Account; admins approve (moves the student) or decline it from the School changes tab.
- **Primary schools:** super admins tick each admin's primary schools under Users. Those students sort first in that admin's queue and drive their Reports page.
- **High School Staff:** the high school role (shown as High School Staff) has a record-keeping type: Counselor, Admin, Teacher or Other. All types have the same access.
- **Parent consent is one-time:** once signed it covers future terms. Reopening earlier steps keeps it; only reopening the Parent consent step itself removes it (e.g. if the parent revokes). Parents see a note with the revoke email, which is still a placeholder: set `CONSENT_REVOKE_EMAIL` in `lib/constants.ts`.
- **Disabling accounts:** super admins can disable or re-enable any user from Users (not their own). A disabled user is signed out everywhere and can't sign in or use an invite link.
- **Course lists:** two kinds. **Dual Enrollment** (taught at the high school; code, title, units, period, teacher, prerequisite) is edited per school at the bottom of `/admin/schools/[id]`. **Concurrent Enrollment** (taught at Shasta College) is **free entry**: students type each class's course code (like PSYC C1000), units, an optional name, the term, and tick a box if it has a prerequisite. The unit total per term adds Dual and Concurrent classes together. Admins can add a concurrent class for a student the same way. The test schools all offer PSYC C1000, ENGL C1000, STAT C1000 and MATH C2210 with period and teacher TBD. Removing a course hides it from new requests; existing requests keep it. Seeded courses and teachers are placeholders.
- **Sign-in lockout:** 5 wrong passwords within 15 minutes locks that email for 15 minutes (unknown emails are treated the same, so nobody can probe which emails exist). Super admins see **Locked** on the Users page and can **Unlock**. Settings are in `lib/security.ts`.
- **Forgot password:** `/forgot` emails a one-time link (expires in 60 minutes, max 3 per hour). Resetting signs the account out everywhere. Email is sent through Resend when `RESEND_API_KEY` and `MAIL_FROM` are set in the environment; without them nothing is emailed, the link is printed in the server log, and test mode (`SHOW_DEMO_ACCOUNTS=1`) shows it on screen. Super admins can also make a **Reset link** for any user from Users. Passwords are stored only as salted scrypt hashes; reset tokens only as SHA-256 hashes.
- **Roster** (`/admin/roster`, all admins): pick a school (primary schools first) and term; view **by class** (every Dual Enrollment section plus Concurrent classes the school's students picked) or **by teacher**, with each student's graduation year, term and the step they're on. Download as CSV.
- **Graduation year:** students choose it at sign-up; admins can set it in the student panel and when adding a student. GPA is no longer kept.
- **Yearly grade check:** students give their grade (1st–12th) and graduation year at sign-up. After July 1 each year, their first sign-in goes to `/confirm-grade` until they confirm both again. Students in 8th grade or below are tagged **Young student** (admin lists, counselor queue, roster) until they report 9th grade. Admins can set grade and graduation year in the student panel.
- **Step 01 (CCCApply) is once-ever** and asks for the Shasta College ID. Students can tick "I don't have my Shasta College ID yet" to skip; they're then sent back to step 01 at every sign-in (and see a reminder) until the ID is added. Reopening earlier steps never resets step 01 or parent consent.
- **High School Staff** can update a student's grade and graduation year and **request** a Shasta College ID change; college admins approve or decline it from the **ID changes** tab.
- **Approve & sign digitally:** High school approval needs the staff member's signature: their saved one, drawn (finger, stylus or mouse), or typed and shown in a cursive script. They can save it for next time. Each approval keeps its signature image.
- **Audit (super admins, `/admin/audit`):** paste Shasta College IDs, pick terms, and download one PDF with each student's parent consent (drawn signature, or the uploaded form attached) and course requests for those terms, plus approvals, including the high school staff signature where the school requires high school approval. A single student's PDF is also linked from their admin panel. Built with pdf-lib.
- **Retiring accounts:** Users → "Retire graduated classes" switches off every student in a graduated class (and parents whose students are all retired). Records are kept; Enable restores an account. Each June super admins see a reminder to retire the class from 4 years ago (dismissable for the year; `DE_TODAY=YYYY-MM-DD` overrides the date for testing).
- **Seeded named accounts** (`ensureAccounts` in `lib/db.ts`) are created on every fresh database, only if missing.

## Workflow rules

- Steps unlock in order. A step unlocks once every *required* step before it is complete. *Optional* steps never block, and *Off* steps are hidden and the list renumbers.
- A student's step rules are copied from their school when they complete their first step, so later admin changes only affect students who haven't started.
- Parent accounts are created only by a student: on step 03 the student enters their parent's name and email and gets an invite link to copy, text or email. The parent sets a password from that link. Admins can't create parent accounts.
- Parents see only whether their consent is needed (plus the courses on the consent form and the consent they signed) unless the student turns on **Account → Let my parent / guardian accounts see my progress**.
- Parent consent: the parent draws a signature with a finger, stylus or mouse (stored as a PNG), or uploads a signed PDF/JPG/PNG of up to 10 MB. File types are checked from the file contents, not the extension.
- Declining a class at high school approval requires a note. It reopens the student's course selection and shows them the note. After a course plan is done, students can use **Add or change classes** on Course selection.
- Register for classes stays locked until the term's registration date (Spring 2027: Dec 2, 8:00 AM PT).
