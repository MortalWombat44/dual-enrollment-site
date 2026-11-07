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
| Counselor, Enterprise HS | ralvarez@suhsd.net |
| Admin | dortiz@shastacollege.edu |

## Screens → routes

| Design | Route |
| --- | --- |
| 2a Student dashboard | `/student` |
| 1b Step detail / moment of completion | `/student/steps/[1-6]` (also holds each step's form) |
| 2d Step complete (desktop) · 1c on phones | `/student/steps/[n]/complete` |
| 1a Dashboard with 4-up grid + contact cell | `/parent` (parent's view of their student) |
| 2b Parent consent: draw-to-sign or upload | `/parent/consent` |
| 2c Counselor review queue | `/counselor` |
| 3a Users + Add user | `/admin/users` |
| 3b Schools + Add school | `/admin/schools` |
| 3c School designation + step rules | `/admin/schools/[id]` |

## Workflow rules

- Steps unlock in order. A step unlocks once every *required* step before it is complete. *Optional* steps never block, and *Off* steps are hidden and the list renumbers.
- A student's step rules are copied from their school when they complete their first step, so later admin changes only affect students who haven't started.
- Parent accounts are created only by a student: on step 03 the student enters their parent's name and email and gets an invite link to copy, text or email. The parent sets a password from that link. Admins can't create parent accounts.
- Parents see only whether their consent is needed (plus the courses on the consent form and the consent they signed) unless the student turns on **Account → Let my parent / guardian accounts see my progress**.
- Parent consent: the parent draws a signature with a finger, stylus or mouse (stored as a PNG), or uploads a signed PDF/JPG/PNG of up to 10 MB. File types are checked from the file contents, not the extension.
- Counselor *Request changes* requires a note. It reopens the student's course selection and shows them the note.
- Register for classes stays locked until the term's registration date (Spring 2027: Dec 2, 8:00 AM PT).
