# Shasta College Dual Enrollment mockups

_Started 2026-11-07 17:53 UTC_

---

## User

Make UI mockups for Dual Enrollment step completion at Shasta College
Similar to the app we were making 
Similar to DualEnroll.com

Sleek, modern, Shasta college green can be a color used

## Assistant



## Assistant

_[tool: list_files]_

_[tool: ask_user]_

_[tool: grep]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

I didn't get answers to my questions, so I made the calls myself and put three screens in **Dual Enrollment Steps.dc.html**, all in Shasta green:

- **1a** is the student dashboard on desktop. It shows how many of the 7 steps are done, a progress bar, an "Up next" block and a grid of all the steps.
- **1b** is the screen a student sees right after finishing a step (parent consent here). It has the step list down the side, who signed and when, the documents sent, and a button to the next step.
- **1c** is the mobile version of that finished-step screen, with the remaining steps listed below.

The step names, dates and people are placeholders I invented. Your earlier app isn't in this project, so I couldn't match it. To bring these closer to it, send screenshots or link that project.

## User

<artifact-content-authored-by-others/>
Answered — user: All three; platform: Desktop web; steps: Apply to Shasta (CCCApply), Parent consent form, Counselor approval, Course selection, Register for classes, Textbooks / Canvas access; screens: Progress dashboard, Step completed / celebration, Document upload, Counselor review queue; variations: 1 polished; green: Primary accent (replace red)

## Assistant

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I added four desktop screens at the top of the page as turn 2, using the 6 steps you picked:

- **2a** Student dashboard showing 3 of 6 steps done.
- **2b** Parent consent screen, with a choice to sign online or upload the signed form.
- **2c** Counselor review queue, with one student's details open on the side and buttons to approve or request changes.
- **2d** The screen a student sees after the counselor approves (step 4 of 6).

I put the steps in this order: Apply on CCCApply, Course selection, Parent consent, Counselor approval, Register, Textbooks & Canvas. Course selection comes before consent and counselor approval so those two have courses to review. Names, dates and course details are placeholders. Turn 1 is still there below for reference.

## User

Open it in a speerate window

## Assistant

_[tool: dc_html_str_replace]_

_[tool: super_inline_html]_

_[tool: get_public_file_url]_

I can't open a browser window for you, so I made a single self-contained copy of the mockups. You can open it in a new tab with this link:

[Open Dual Enrollment Steps](https://1e5bb3b6-4c6f-4044-823e-1ad264708037.claudeusercontent.com/v1/design/projects/1e5bb3b6-4c6f-4044-823e-1ad264708037/serve/Dual%20Enrollment%20Steps%20(standalone).html?t=a9883aeed3d4f640d41f4050493036933c3548b91242808aec2b58b17843fff5.28651911-92a7-4a10-ab81-1a4e3504934d.664e9a73-7a42-4b79-a5c9-96961b405e28.1794079125.fp&direct=1)

The link expires in about an hour. The copy is also saved in the project as `Dual Enrollment Steps (standalone).html`.

## User

Design a back end admin page where admin can add users
Can add schools and designated them as CCAP or non CCAP

And for each school admin should be able to select which steps are equired or not required

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I added three admin screens at the top of the page as turn 3:

- **3a Users:** a user list you can filter by role, with an "Add user" pop-up (name, email, role, school, then an email invite).
- **3b Schools:** the school list showing each school as CCAP or Non-CCAP and how many steps it requires, plus an "Add school" button.
- **3c School detail:**
  - Switches the school between CCAP and Non-CCAP, with fields for the CCAP agreement ID and expiry date.
  - Sets each of the 6 steps to Required, Optional or Off.

These are static mockups, so the toggles don't respond to clicks yet. I added "Optional" as a third setting next to required and not required. Say if you only want two. The example step settings in 3c (counselor approval turned off for a CCAP school) are made up. The standalone copy I gave you earlier doesn't include these screens; I can make a new one.

## User

What was the work flow imagined when designing this

## Assistant

The screens assume three groups of people move one student through 6 steps in a fixed order, with Shasta College staff setting up the rules first.

**1. Admin setup (3a–3c)**
- A Shasta DE admin adds partner high schools and marks each one CCAP or Non-CCAP.
- For each school, the admin sets every step to Required, Optional or Off. For example, a CCAP school might turn off counselor approval because the agreement already covers it.
- The admin invites users (students, parents, counselors, other admins) and links each one to a school. Invited users get an email to set a password.

**2. Student journey (2a, 2d)**
1. **Apply on CCCApply.** The student applies and gets a Shasta student record.
2. **Course selection.** The student picks from sections approved for their school.
3. **Parent consent.** The parent is asked to sign.
4. **Counselor approval.** The high school counselor reviews the course plan.
5. **Register for classes.** This opens on a set date, and Admissions & Records may handle it for CCAP groups.
6. **Textbooks & Canvas.** Usually informational, so it doesn't hold up completion.

Steps unlock in order. The dashboard shows how many steps are done, what's next, and when it's due. Finishing a step shows a "step complete" screen that leads into the next one.

**3. Parent (2b)**
The parent gets a request at step 3. They either sign online or upload a signed form, and they can see what they're agreeing to: courses, cost and transcript.

**4. Counselor (2c)**
- The counselor works through a queue of their school's students who are waiting on step 4.
- Each student shows completed steps and the courses requested.
- The counselor approves or requests changes, with an optional note.
- Approving moves the student to step 5 and notifies both the student and the parent.

**Assumptions I made that you should check**
- The step order, especially course selection coming before consent and counselor approval.
- Each step is done by one role.
- Changing a school's step rules only affects students who haven't started yet.
- Each user belongs to one school.

