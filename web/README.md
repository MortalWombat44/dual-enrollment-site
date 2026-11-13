# Shasta College Dual Enrollment

A Next.js 15 app built from the Claude Design handoff in `../project/Dual Enrollment Steps.dc.html`.

## Run it

(Working on the code? See `../CLAUDE.md` for commands, architecture and tests.)

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
| Transcripts: bulk upload, matched by file name; confirm unmatched ones (college admins) | `/admin/transcripts` |
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

1. Apply on CCCApply: Shasta College ID (student, once ever). Links to Shasta College's Apply page (Go to CCCApply and apply to Shasta College) and the step-by-step guide.
2. Parent consent (parent, invited by the student). **Not needed for students 18 or older today** (from their date of birth; a student who turns 18 later, even before registration, still needs it until their birthday). A one-time, general consent, not tied to specific classes. Course selection stays locked until it's signed.
3. Course selection (student)
4. High school approval: **Non-CCAP schools only** (and never for homeschooled students). Students at an **unlisted ("Other") school** name the person who approves their classes there; that person gets a link (emailed when email is set up, or the student/admin sends it) and approves and signs without an account. The audit PDF records their name and email (never at CCAP schools; set by designation, not editable). Each class is approved **per class, per term**: staff approve or decline each pending class and sign digitally once for the batch. Classes already approved stay approved; adding a class (e.g. for next term) opens the step again for just that class. Declining needs a note and sends the student back to Course selection. Students and parents don't see staff names; they're told to check with their high school counselor.
- Private School Affidavit (**homeschooled students only**): the student or parent uploads it (PDF/JPG/PNG) any time; a college admin approves or declines it on the **Homeschool** tab (shown only while one is waiting). It must be approved before Clear units.
5. Young student documents (8th grade and below only): a recent transcript or report card and a letter from the principal saying how the student will benefit from the specific course(s).
6. Young student review (8th grade and below only): a **college counselor** recommends (or not) with feedback, then a different admin flagged **Young Student Approver** approves or declines. Approving moves the student to Clear units; declining sends them back to Course selection with the note (documents are sent again, since the letter is course-specific). Admins see a **Young students** tab on `/admin/students` only while someone is waiting.
7. **College review & clear units** (college admin). The admin confirms (and can correct) the Shasta College ID and checks off **Program in SACP**, **Start date in RGPE** and **Cohort in STAL** in Colleague, then clicks **All verified & units cleared in Colleague** (all three checks are required; the verification and any ID change are recorded and appear on the audit PDF). Runs again whenever the student's classes change. **Runs alongside Prerequisite review**: both open at the same time and can be worked in either order; Register waits for both. For **CCAP students only**, the admin can tick **Cleared for the maximum units** for the term(s) of the classes being cleared; classes added later in those terms then skip Clear units (a class in a new term still comes back). Staff only: students aren't told. It shows in the admin panel and the audit PDF, and moving Clear units back removes it.
8. Prerequisite review (college counselor). Only shown when a requested class has a prerequisite, or a class was flagged for review. Approving needs the counselor to check **Student cleared in NCWS** (declining doesn't); it's recorded on the audit PDF. Tracked **per class**: admins see "No prerequisite selected" on a class and can click **Needs prerequisite review** to put it in the queue (even after Clear units); students can do the same from Course selection ("Missed a prerequisite?"). Decided per class **per term** (the same class in Spring and Summer gets two decisions; declining one keeps the other). Any college admin can see the review, but only college counselors can decide. A counselor can also put a class **on hold** instead of deciding: **More info needed** (a note saying what's needed is required) or **Appointment required**. The student sees "Prerequisite: More information needed" or "Prerequisite: Appointment with a college counselor required" on their dashboard and Prerequisite review step (and gets an email when email is set up). Held classes leave the Prerequisites queue for a **Prerequisites · waiting on student** tab. For more information, the student's reply (message and/or transcript), or any transcript uploaded for them, puts it back in the queue and notifies the counselor. For an appointment, the student can send a message (it stays on hold); a counselor decides after the appointment or clicks **Appointment done: back to queue** (any admin can put a held class back). The booking link is still a placeholder: set `COUNSELING_APPOINTMENT_URL` in `lib/constants.ts`. Any admin can **Nudge** it: college counselors (those with the student's school as primary, else all) are notified, and the student goes to the top of the Prerequisites queue, highlighted red, until a counselor decides. **Mark complete** on Prerequisite review, or on any later step while it's open, shows a warning naming the classes; the admin can confirm and do it anyway.
9. Register for classes, **per term**. Before the term's registration date it shows **Ready to register**; once registration has been open more than 5 days without the student confirming, it shows **Overdue registration** (red in lists, its own admin tab, and a notice to the student). every student registers themselves in myShasta, then confirms here for each term ("I'm registered for Spring 2027"). Adding a class in a new term later asks them to register for that term too. An admin's "Mark complete" marks every term.

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
- **Course lists:** two kinds. **Dual Enrollment** (taught at the high school; code, title, units, period, teacher, prerequisite) is edited per school at the bottom of `/admin/schools/[id]`. **Concurrent Enrollment** (taught at Shasta College) has a **list kept on the Courses page** (checkboxes for every student; a listed prerequisite sends it to review) **plus free entry** for anything not listed: students type each class's course code (like PSYC C1000), units, an optional name, the term, and tick a box if it has a prerequisite. The unit total per term adds Dual and Concurrent classes together. Admins can add a concurrent class for a student the same way. The test schools all offer PSYC C1000, ENGL C1000, STAT C1000 and MATH C2210 with period and teacher TBD. A Dual Enrollment section can be offered every term or one term only (Term column on the school's course list); a one-term section only shows while that term is open, and only for that term.
- **Course upload (super admins, `/admin/courses`):** download the Excel or CSV template, fill in one row per section (Code, Title, Units required; Period, Teacher, Prerequisite optional), pick the school and term (or every term) and upload a .xlsx or .csv. Every row is checked first; if anything is wrong nothing is imported and the problems are listed by line. Rows with the same code and period as an existing course for that school and term update it; others are added. Tick **Replace the list** to remove courses for that school and term that aren't in the file (students who requested them keep them). Removing a course hides it from new requests; existing requests keep it. Removed courses are hidden from the list until you click **Show removed**, and saving, removing, restoring or adding a course updates the list in place (no page reload). Seeded courses and teachers are placeholders.
- **Sign-in lockout:** 5 wrong passwords within 15 minutes locks that email for 15 minutes (unknown emails are treated the same, so nobody can probe which emails exist). Super admins see **Locked** on the Users page and can **Unlock**. Settings are in `lib/security.ts`.
- **Forgot password:** `/forgot` emails a one-time link (expires in 60 minutes, max 3 per hour). Resetting signs the account out everywhere. Email is sent through Resend when `RESEND_API_KEY` and `MAIL_FROM` are set in the environment; without them nothing is emailed, the link is printed in the server log, and test mode (`SHOW_DEMO_ACCOUNTS=1`) shows it on screen. Super admins can also make a **Reset link** for any user from Users. Passwords are stored only as salted scrypt hashes; reset tokens only as SHA-256 hashes.
- **Roster** (`/admin/roster`, all admins): pick a school (primary schools first) and term; view **by class** (every Dual Enrollment section plus Concurrent classes the school's students picked) or **by teacher**, with each student's graduation year, term and the step they're on. Download as CSV.
- **Graduation year:** students choose it at sign-up; admins can set it in the student panel and when adding a student. GPA is no longer kept.
- **Yearly grade check:** students give their grade (1st–12th) and graduation year at sign-up. After July 1 each year, their first sign-in goes to `/confirm-grade` until they confirm both again. Students in 8th grade or below are tagged **Young student** (admin lists, counselor queue, roster) until they report 9th grade. Admins can set grade and graduation year in the student panel.
- **Step 01 (CCCApply) is once-ever** and asks for the Shasta College ID. Students can tick "I don't have my Shasta College ID yet" to skip; they're then sent back to step 01 at every sign-in (and see a reminder) until the ID is added. Reopening earlier steps never resets step 01 or parent consent.
- **High School Staff** can update a student's grade and graduation year and **request** a Shasta College ID change; college admins approve or decline it from the **ID changes** tab.
- **Approve & sign digitally:** High school approval needs the staff member's signature: their saved one, drawn (finger, stylus or mouse), or typed and shown in a cursive script. They can save it for next time. Each approval keeps its signature image.
- **Student files (super admins, `/admin/files`):** by graduating class, download a ZIP (a folder per student with their record PDF and stored files: parent signature, high school approval signatures, uploaded documents; plus index.csv). After a download that includes the newest file, **Delete files** schedules deleting them in **10 minutes**, with a countdown and **Cancel deletion**. Deletion runs on its own (checked every 30 seconds, `instrumentation.ts`). Accounts and records stay; only stored files go, and the record PDF notes a missing signature image.
- **Audit (super admins, `/admin/audit`):** paste Shasta College IDs, pick terms, and download one PDF with each student's parent consent (drawn signature, or the uploaded form attached) and course requests for those terms, plus approvals, including the high school staff signature where the school requires high school approval. A single student's PDF is also linked from their admin panel. Built with pdf-lib.
- **Retiring accounts:** Users → "Retire graduated classes" switches off every student in a graduated class (and parents whose students are all retired). Records are kept; Enable restores an account. Each June super admins see a reminder to retire the class from 4 years ago (dismissable for the year; `DE_TODAY=YYYY-MM-DD` overrides the date for testing).
- **No named accounts are seeded with passwords in the code.** The old seeded super admin (tmiller@shastacollege.edu) is deleted at startup wherever it still exists. Create real admins from Users.
- **Transcripts (for prerequisite review):** the student (on Prerequisite review), their High School Staff (any type, from the student panel) and college admins (student panel) can upload a transcript (PDF/JPG/PNG, 10 MB). Counselors see them on the student's panel, marked **New** if added since the last prerequisite decision. They're included in the class's student-files ZIP.
- **Bulk transcript upload** (`/admin/transcripts`, college admins): pick many files; they're sent one at a time and matched by **file name**. A Shasta College ID on exactly one account, or a first and last name exactly one student has, is assigned right away (an ID on two accounts, a name shared by several students, or a name with someone else's ID is not). Everything else waits under **Needs a match** with the closest student suggested (name similarity of 70% or more, or an ID one character off); staff confirm, pick another student (name or ID), or delete. The admin menu shows how many are waiting.
- **History (audit trail):** every student has a history of who did what and when, grouped by term: class requests and removals (and by whom), high school approvals/declines, prerequisite decisions, holds and replies, College review (with the Colleague checks), steps marked complete or moved back, registrations, transcripts and uploads, nudges, help requests, ID and school changes, archiving. Account-wide events (consent, CCCApply, ID changes) are under "All terms". Shown at the bottom of the admin student panel and in the audit PDF (for the chosen terms). History before this feature was filled in once from existing records (steps completed, high school and prerequisite approvals, registrations), marked "From earlier records".
- **Young student documents** that are replaced (the student was sent back and uploads again) are deleted, from the database and from disk.

## Workflow rules

- Steps unlock in order. A step unlocks once every *required* step before it is complete. *Optional* steps never block, and *Off* steps are hidden and the list renumbers.
- A student's step rules are copied from their school when they complete their first step, so later admin changes only affect students who haven't started.
- Parent accounts are created only by a student: on step 03 the student enters their parent's name and email and gets an invite link to copy, text or email. The parent sets a password from that link. Admins can't create parent accounts.
- Parents see only whether their consent is needed (plus the courses on the consent form and the consent they signed) unless the student turns on **Account → Let my parent / guardian accounts see my progress**.
- Parent consent is **digital signature only**: the parent draws a signature with a finger, stylus or mouse (stored as a PNG). Uploading a signed form is turned off; forms uploaded before that stay viewable. Shasta College can still mark consent as on file from the admin panel.
- **Student profile:** sign-up collects date of birth, phone and mailing address (email was already required). 12th graders are asked whether they plan to attend Shasta College after high school, at sign-up and at each yearly grade confirmation. Existing students missing any of these fill them in on their next sign-in (`/complete-profile`); they can edit them on their Account page. Staff see age and contact info on the student's panel.
- **High school choices:** the listed schools, **Other (not listed)** (type the school, plus the approver's name and email; it's added as a Non-CCAP school marked "Added by a student"), or **Other - Homeschooled**. The same choices are in a student's "Request a high school change".
- **Seniors' plans export** (super admins and college counselors): Reports page shows the counts and a CSV of this year's seniors who answered, with contact info.
- **Notifications** (`/admin/notifications`, count in the admin menu; emailed too when email is set up): admins flagged **Young student lead** get young student items (documents sent, recommendation ready); **Homeschool lead** gets homeschool items (new homeschooled student, affidavit uploaded). With no lead set, super admins get them.
- **My schools:** the school filter on the Students page includes "My schools" (an admin's primary schools).
- **Shared IDs tab:** accounts with the same Shasta College ID are listed together under the ID, with a red bracket on the left.
- **Help flags:** students (dashboard and every step page) and high school staff (student panel) can say where the student is stuck. It goes to the college admins who have the student's school as a primary school, or to every college admin if no one does. Admins see a **Help** tab while any are open, reply, and mark them resolved; the student sees the reply.
- **Request more classes any time:** after the first course selection, students can add classes from Course selection (or **+ Request more classes** on their dashboard), even while other classes are in review. Nothing already requested changes; the new classes go to the high school (Non-CCAP), and Shasta College clears units and checks prerequisites again. Young students send their documents again, since the principal's letter names the classes. **Change or remove classes** reopens Course selection.
- **High school approval can't be moved back** by an admin: approvals live on each class. "Move back" explains which classes were already approved.
- **Turning a term's registration off archives** the requests of students who hadn't registered for that term. Archived requests leave the workflow but stay visible to staff (admin student panel, high school staff panel, roster, audit PDF) with the reason; students see a short notice on Course selection while the term stays closed. A student left with no active classes goes back to Course selection. Classes in a closed term that the student did register for are kept as they are and can't be moved by editing Course selection. Requesting an archived class again (once the term reopens) starts it fresh.
- Declining a class at high school approval requires a note. It reopens the student's course selection and shows them the note. After a course plan is done, students can use **Add or change classes** on Course selection.
- Register for classes stays locked until the term's registration date (Spring 2027: Dec 2, 8:00 AM PT).
