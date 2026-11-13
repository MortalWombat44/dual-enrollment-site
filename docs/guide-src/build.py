"""Builds guide.html (College Admin guide). Page numbers for the contents are filled in by render.js (two passes)."""
import json, sys
from pathlib import Path
import diagrams as D

HERE = Path(__file__).parent
pages = json.loads((HERE / 'toc-pages.json').read_text()) if (HERE / 'toc-pages.json').exists() else {}

SECTIONS = []  # (id, number, title)


def h2(sid, num, title):
    SECTIONS.append((sid, num, title))
    return f'<section class="chapter" id="{sid}"><div class="chap-num">{num}</div><h2 data-toc="{sid}">{title}</h2>'


def fig(svg, caption):
    return f'<figure class="diagram">{svg}<figcaption>{caption}</figcaption></figure>'


def callout(kind, title, body):
    return f'<div class="callout {kind}"><div class="callout-title">{title}</div><div>{body}</div></div>'


def steps(*items):
    return '<ol class="steps">' + ''.join(f'<li>{i}</li>' for i in items) + '</ol>'


body = []

# ---------------------------------------------------------------- 1
body.append(h2('intro', '01', 'Introduction'))
body.append('''
<p class="lead">The Dual Enrollment portal takes a high school student from their first application to registered classes at Shasta College. Students, parents, high school staff and Shasta College staff each do their part in one place, and everyone can see what happens next.</p>
<p>This guide is for <strong>College Admins</strong>: Shasta College staff who review students, college review, answer help requests and keep records accurate. It explains how the student workflow is put together, how to work each review queue, and what the settings on your account do. A short chapter at the end covers the extra tools available to <strong>Super Admins</strong>.</p>
<h3>Who uses the portal</h3>
<table>
<thead><tr><th>Role</th><th>What they do</th></tr></thead>
<tbody>
<tr><td><strong>Student</strong></td><td>Creates an account, applies on CCCApply, picks classes, uploads documents when asked, confirms registration, asks for help.</td></tr>
<tr><td><strong>Parent / guardian</strong></td><td>Invited by the student. Signs the one-time consent online; can upload a homeschool affidavit. Sees the student&rsquo;s progress only if the student shares it.</td></tr>
<tr><td><strong>High School Staff</strong></td><td>Approves or declines each requested class at Non-CCAP schools and signs digitally; updates grade and graduation year; flags students who need help.</td></tr>
<tr><td><strong>College Admin</strong></td><td>Works the review queues (College review, help requests, homeschool affidavits, school and ID changes), corrects records, views rosters and reports.</td></tr>
<tr><td><strong>Super Admin</strong></td><td>Everything a College Admin does, plus users, schools, courses, terms, audits and student file retention.</td></tr>
</tbody></table>
''')
body.append(callout('info', 'Signing in', 'Use your Shasta College email and password. After 5 wrong passwords in 15 minutes the account locks for 15 minutes; a Super Admin can unlock it from <em>Users</em>. Use <em>Forgot password</em> on the sign-in page for a one-time reset link (valid for 60 minutes). Sessions last 14 days on a device.'))
body.append('</section>')

# ---------------------------------------------------------------- 2
body.append(h2('tour', '02', 'Finding your way around'))
body.append('''
<p>The menu on the left of every admin page gives you:</p>
<table class="compact">
<thead><tr><th style="width:28%">Menu item</th><th>Use it to</th></tr></thead>
<tbody>
<tr><td><strong>Students</strong></td><td>Work the review queues and open any student&rsquo;s record. This is your home page.</td></tr>
<tr><td><strong>Transcripts</strong></td><td>Upload many transcripts at once; each is matched to a student by its file name. The menu shows how many are waiting for you to confirm the student.</td></tr>
<tr><td><strong>Roster</strong></td><td>See who has selected each class at a school, by class or by teacher, and download a CSV.</td></tr>
<tr><td><strong>Reports</strong></td><td>Your College review totals and wait times; the seniors&rsquo; plans export (college counselors and Super Admins).</td></tr>
<tr><td><strong>Notifications</strong></td><td>Items sent to you: help requests, and young student or homeschool items if you are a lead. The menu shows how many are unread.</td></tr>
</tbody></table>
<h3>The Students page</h3>
<p>Four numbers sit across the top: students waiting on <em>College review</em>, <em>Prerequisite review</em> and a parent, and the next registration date. Below are the queue tabs, the student list and, on the right, the student panel. Filter by school (including <strong>My schools</strong>, your primary schools), term, name or Shasta College ID; students at your primary schools are always listed first.</p>
<h3>Queue tabs</h3>
<p>Tabs marked <span class="pill">when open</span> or <span class="pill">when waiting</span> only appear while something needs attention.</p>
<table class="compact">
<thead><tr><th style="width:28%">Tab</th><th>Shows</th></tr></thead>
<tbody>
<tr><td><strong>Help</strong> <span class="pill">when open</span></td><td>Students with an open help request.</td></tr>
<tr><td><strong>Overdue registration</strong> <span class="pill">when waiting</span></td><td>Students whose registration has been open more than 5 days without confirming.</td></tr>
<tr><td><strong>College review</strong></td><td>Students waiting for Shasta College to check their classes and unit load.</td></tr>
<tr><td><strong>Prerequisites</strong></td><td>Classes with a prerequisite, waiting for a college counselor.</td></tr>
<tr><td><strong>Prerequisites · waiting on student</strong> <span class="pill">when waiting</span></td><td>Prerequisite reviews a counselor put on hold (more information or an appointment needed). They come back to <em>Prerequisites</em> when the student responds.</td></tr>
<tr><td><strong>Young students</strong> <span class="pill">when waiting</span></td><td>Students in 8th grade and below waiting for a recommendation or decision.</td></tr>
<tr><td><strong>Homeschool</strong> <span class="pill">when waiting</span></td><td>Private School Affidavits waiting for review.</td></tr>
<tr><td><strong>School changes · ID changes · Shared IDs</strong></td><td>Requests to change a student&rsquo;s high school or Shasta College ID, and IDs that appear on more than one account.</td></tr>
<tr><td><strong>All students</strong></td><td>Everyone, for lookups and corrections.</td></tr>
</tbody></table>
</section>''')

# ---------------------------------------------------------------- 3
body.append(h2('workflow', '03', 'The student workflow'))
body.append('''<p>Every student follows the same path. Some steps only apply to certain students; the portal adds or skips them automatically. Steps unlock in order, with one exception: a homeschooled student&rsquo;s affidavit can be uploaded and reviewed at any time.</p>''')
body.append(fig(D.journey(), 'Figure 1. The student’s steps. Students see them numbered 01, 02, … counting only the steps that apply to them.'))
body.append('''
<h3>When each step applies</h3>
<table class="compact">
<thead><tr><th style="width:30%">Step</th><th>Applies to</th><th style="width:26%">Done by</th></tr></thead>
<tbody>
<tr><td>Apply on CCCApply</td><td>Everyone, once ever. A student may skip entering their ID, but is brought back to this step at each sign-in until it&rsquo;s added.</td><td>Student</td></tr>
<tr><td>Parent consent</td><td>Students under 18 <em>today</em>. One-time, general consent that covers future terms. Course selection stays locked until it&rsquo;s signed.</td><td>Parent (digital signature only)</td></tr>
<tr><td>Course selection</td><td>Everyone. Dual Enrollment from the school&rsquo;s list; Concurrent from the college&rsquo;s list or typed in. Students can request more classes at any time afterwards.</td><td>Student</td></tr>
<tr><td>High school approval</td><td>Non-CCAP schools and unlisted (&ldquo;Other&rdquo;) schools. Never CCAP or homeschool.</td><td>High school staff, or the named outside approver</td></tr>
<tr><td>Private School Affidavit</td><td>Homeschooled students.</td><td>Student or parent uploads; College Admin reviews</td></tr>
<tr><td>Young student review</td><td>8th grade and below.</td><td>College counselor, then a Young Student Approver</td></tr>
<tr><td>College review</td><td>Everyone. Runs at the same time as prerequisite review.</td><td>College Admin</td></tr>
<tr><td>Prerequisite review</td><td>Classes with a prerequisite, or flagged for review later by an admin or the student. Runs alongside College review.</td><td>College counselor</td></tr>
<tr><td>Register for classes</td><td>Everyone, once per term. &ldquo;Ready to register&rdquo; until the term&rsquo;s registration date; &ldquo;Overdue registration&rdquo; after 5 days open.</td><td>Student, in myShasta</td></tr>
</tbody></table>
''')
body.append(callout('info', 'The 18-and-over rule', 'Parent consent is skipped for students who are 18 or older <strong>on the day they use the portal</strong>, based on the date of birth they give. A student who will turn 18 before registration opens still needs consent until their birthday.'))
body.append('</section>')

# ---------------------------------------------------------------- 4
body.append(h2('populations', '04', 'Schools and student groups'))
body.append('''
<p>The student&rsquo;s high school decides which steps they see and their usual unit limit.</p>
<table>
<thead><tr><th style="width:24%">School type</th><th>High school approval</th><th style="width:22%">Usual unit limit</th></tr></thead>
<tbody>
<tr><td><strong>CCAP</strong></td><td>None (covered by the CCAP agreement).</td><td>15 per term</td></tr>
<tr><td><strong>Non-CCAP</strong></td><td>Required for every class, every term, by the school&rsquo;s High School Staff.</td><td>11 per term; 7 in summer</td></tr>
<tr><td><strong>Other (not listed)</strong></td><td>Required. The student names the person who approves classes at their school; that person approves from an emailed link.</td><td>11; 7 in summer</td></tr>
<tr><td><strong>Homeschool</strong></td><td>None. A Private School Affidavit is reviewed by Shasta College instead.</td><td>11; 7 in summer</td></tr>
</tbody></table>
<p>Unit limits are guidance, not a block: students can go over, and they, their high school and the admin clearing units all see a note.</p>
<h3>Groups that get extra steps</h3>
<div class="cards">
<div class="card"><div class="card-title">Young students</div><p>8th grade and below. Tagged &ldquo;Young student&rdquo; in lists and rosters until they report 9th grade. They send a report card and a principal&rsquo;s letter, then go through a two-person review.</p></div>
<div class="card"><div class="card-title">Homeschooled</div><p>Chose &ldquo;Other - Homeschooled&rdquo;. They upload a Private School Affidavit, which a College Admin approves before College review.</p></div>
<div class="card"><div class="card-title">Unlisted school</div><p>Chose &ldquo;Other&rdquo; and typed their school. The school is added as Non-CCAP and marked &ldquo;Added by a student&rdquo;. Their named approver signs by link.</p></div>
<div class="card"><div class="card-title">18 and over</div><p>No parent consent needed. Staff see the student&rsquo;s age on the student panel.</p></div>
</div>
</section>''')

# ---------------------------------------------------------------- 5
body.append(h2('clear', '05', 'College review &amp; clear units'))
body.append('''<p>College review &amp; clear units is the main College Admin task. You verify the student&rsquo;s record in Colleague and clear their unit load. A student arrives in the queue once their earlier steps are done, at the same time as prerequisite review (if any), so the two can be worked in either order. You confirm that their classes, terms and unit load make sense before they move on.</p>''')
body.append(fig(D.clear_units(), 'Figure 2. College review: verify and clear, or send the plan back.'))
body.append('<h3>How to do a college review</h3>')
body.append(steps(
    'Open <strong>Students</strong>. The <em>College review</em> tab is selected; students at your primary schools are listed first.',
    'Click a student and check the plan: classes by term, registration status, and units against the usual limit.',
    'In Colleague, confirm the student&rsquo;s <strong>Shasta College ID</strong> (correct it in the panel if it&rsquo;s wrong), their <strong>Program in SACP</strong>, <strong>Start date in RGPE</strong> and <strong>Cohort in STAL</strong>. Tick each one.',
    'Click <strong>All verified &amp; units cleared in Colleague</strong> (all three checks are required). The verification and any ID change go on the audit record.',
    'To ask for changes instead, write a note and click <strong>Send back to student</strong>. Course selection reopens with your note.',
))
body.append(callout('tip', 'CCAP students: cleared for the maximum units', 'Tick <strong>Cleared for the maximum units</strong> to let classes added later in the same term(s) skip College review; a class in another term still comes back. Staff only, not shown to the student. Moving College review back removes it.'))
body.append('</section>')

# ---------------------------------------------------------------- 6
body.append(h2('reviews', '06', 'Other reviews'))
body.append('<h3>Prerequisite review</h3><p>Only admins designated as <strong>college counselors</strong> can decide these; any admin can see them. For college counselors, Prerequisite review appears at the top of the student panel, above College review. Each class is decided separately <em>for each term</em>, so the same class can be approved for Spring and declined for Summer. A class is reviewed when its course has a prerequisite, or when someone flags it.</p>')
body.append(callout('info', 'Classes the student didn&rsquo;t mark', 'Under <em>Classes requested</em>, a class with no prerequisite shows &ldquo;No prerequisite selected&rdquo;. If you know it has one, click <strong>Needs prerequisite review</strong>: it goes into the Prerequisites queue right away, even after College review, and nothing else is reopened. Students can do the same from Course selection (&ldquo;Missed a prerequisite?&rdquo;).'))
body.append(steps(
    'Open the <strong>Prerequisites</strong> tab and click a student.',
    'Open any <strong>Transcripts</strong> on the panel (new ones are marked <em>New</em>).',
    'For each class and term, choose <strong>Approve</strong>, <strong>Decline</strong>, <strong>More info needed</strong> or <strong>Appointment required</strong>. Before approving, clear the student in NCWS and check <strong>Student cleared in NCWS</strong> (required to approve; recorded on the audit record).',
    'Write a note: required to decline or to ask for more information (say exactly what you need; the student sees it). Then <strong>Save decisions</strong>. Declined classes come off the request; if nothing is left, the student goes back to Course selection.',
))
body.append('''<h3>Putting a prerequisite on hold</h3>
<table class="compact"><tbody>
<tr><td style="width:30%"><strong>More info needed</strong></td><td>The student sees &ldquo;Prerequisite: More information needed&rdquo; with your note, on their dashboard and step, and can reply with a message, a transcript or both. Their reply, or any transcript uploaded for them (by the student, their high school or Shasta College), puts the class back in the Prerequisites queue and notifies you.</td></tr>
<tr><td><strong>Appointment required</strong></td><td>The student sees &ldquo;Prerequisite: Appointment with a college counselor required&rdquo; and is told to book one. They can send a message (for example, the date); it stays on hold. After the appointment, decide the class, or click <strong>Appointment done: back to queue</strong>.</td></tr>
</tbody></table>
<p>Held classes move from <em>Prerequisites</em> to <em>Prerequisites &middot; waiting on student</em>. Any admin can click <strong>Back to queue</strong> on a held class. Students get an email about the hold when email is set up.</p>''')
body.append(callout('tip', 'Not a college counselor? Nudge it', 'Any College Admin can open a prerequisite review and read it. To speed one up, click <strong>Nudge</strong> on the student (optionally say why it&rsquo;s urgent). College counselors with that school as a primary school are notified, or every college counselor if none has it, and the student moves to the top of the Prerequisites queue, highlighted red, until a counselor decides.'))
body.append('''<h3>Transcripts</h3>
<p>Transcripts support prerequisite review. Students can send one from their Prerequisite review step; their High School Staff can upload one from their student panel; and you can upload one under <strong>Transcripts</strong> on any student&rsquo;s panel. Each upload is recorded in the student&rsquo;s history with who added it.</p>
<p><strong>Bulk upload</strong> (menu &rarr; <em>Transcripts</em>): choose many files at once. Each is matched by its <strong>file name</strong>:</p>
<ul class="ticks">
<li>A <strong>Shasta College ID</strong> that is on exactly one account (e.g. <em>0412345_transcript.pdf</em>) is added to that student right away.</li>
<li>Otherwise, a <strong>first and last name</strong> that exactly one student has (e.g. <em>Rivera_Maya.pdf</em>) is added right away.</li>
<li>Everything else waits under <strong>Needs a match</strong> with the closest student suggested (a name spelled a little differently, or an ID one character off). Click <em>Add to &hellip;</em> to confirm, pick another student by name or ID, or delete the file.</li>
</ul>''')
body.append('<h3>Young student review</h3><p>Students in 8th grade and below send a recent report card or transcript and a letter from their principal describing how the student will benefit from the specific class. Two different people review them.</p>')
body.append(fig(D.young(), 'Figure 3. Young student review: recommendation, then a separate decision.'))
body.append(steps(
    'A <strong>college counselor</strong> opens the <em>Young students</em> tab, opens both documents, chooses <em>Recommend</em> or <em>Don&rsquo;t recommend</em>, and writes feedback for the approver.',
    'A <strong>Young Student Approver</strong> (a different admin) reads the recommendation and chooses <em>Approve</em> (on to College review) or <em>Decline</em> with a note.',
))
body.append('<h3>Private School Affidavit (homeschool)</h3><p>Any College Admin can review these from the <em>Homeschool</em> tab.</p>')
body.append(fig(D.affidavit(), 'Figure 4. Reviewing a Private School Affidavit.'))
body.append(steps(
    'Open the <strong>Homeschool</strong> tab and click the student.',
    'Click <strong>Open the affidavit</strong> and check that it is the current school year&rsquo;s filing.',
    'Choose <strong>Approve</strong>, or <strong>Decline</strong> with a note explaining what is needed. The student and parent see the note and can upload a new one.',
))
body.append('</section>')

# ---------------------------------------------------------------- 7
body.append(h2('hs', '07', 'High school approval'))
body.append('''<p>You don&rsquo;t approve classes for the high school, but you will often be asked how it works. Approval is <strong>per class, per term</strong>, and each approval keeps the signer&rsquo;s digital signature for the audit record.</p>''')
body.append(fig(D.hs_approval(), 'Figure 5. Who approves, and what happens next.'))
body.append('''
<ul class="ticks">
<li><strong>Listed Non-CCAP schools:</strong> the school&rsquo;s High School Staff approve or decline each class from their review queue and sign once for the batch, using a saved, drawn or typed signature.</li>
<li><strong>Unlisted (&ldquo;Other&rdquo;) schools:</strong> the student names the approver and their email. The approver gets a secure link (valid 90 days) and approves without an account. If email isn&rsquo;t set up, the student or you can send the link: open the student and click <strong>Send a new approval link</strong>. A new link replaces the old one.</li>
<li><strong>Moving back:</strong> approvals live on each class, so High school approval can&rsquo;t be moved back. If you try, the portal lists the classes that were already approved. To change a class, remove it or move it to another term; the new request goes back to the high school.</li>
</ul>''')
body.append('</section>')

# ---------------------------------------------------------------- 8
body.append(h2('record', '08', 'Working with a student record'))
body.append('''<p>Click any student to open their panel. From top to bottom it shows:</p>
<table class="compact"><tbody>
<tr><td style="width:30%"><strong>Header</strong></td><td>Name, term, school, class year, Shasta College ID, date of birth and age, email, phone and address; for unlisted schools, the named approver.</td></tr>
<tr><td><strong>Review sections</strong></td><td>Any review waiting on you: College review, prerequisites, young student review, affidavit, help requests.</td></tr>
<tr><td><strong>Archived requests</strong></td><td>Classes archived because registration for their term was turned off before the student registered (see chapter 9).</td></tr>
<tr><td><strong>Steps</strong></td><td>Every step with its status, and <em>Mark complete</em> or <em>Move back</em>.</td></tr>
<tr><td><strong>Classes requested</strong></td><td>Move a class to another term, remove it, request a Dual Enrollment class, or type in a Concurrent class for the student.</td></tr>
<tr><td><strong>Grade, school, ID, documents</strong></td><td>Correct grade, graduation year, school or Shasta College ID; open the parent consent and audit record.</td></tr>
<tr><td><strong>History</strong></td><td>Who did what and when, grouped by term: who requested each class, high school approvals, prerequisite decisions and holds, College review, steps moved forward or back, transcripts and uploads. Things not tied to a term (consent, CCCApply, ID changes) are under <em>All terms</em>. The audit PDF includes the same history.</td></tr>
</tbody></table>
<h3>Moving steps forward or back</h3>
<p>Use these to correct a record, for example when consent is on paper in the office.</p>
<ul class="ticks">
<li><strong>Mark complete</strong> finishes a step on the student&rsquo;s behalf. If prerequisite review is still open, marking it (or any later step) complete shows a warning naming the classes; you can confirm and do it anyway. Those links show in red. For parent consent it records &ldquo;On file with Shasta College&rdquo;; for Register it marks every term as registered; for High school approval it approves the pending classes without a high school signature.</li>
<li><strong>Move back</strong> reopens a step and every step after it. CCCApply and parent consent are kept unless you move back that step itself. Moving back Register clears registrations for all terms; moving back College review removes any &ldquo;maximum units&rdquo; clearance.</li>
</ul>''')
body.append('''<h3>School changes, ID changes and shared IDs</h3>
<table class="compact"><tbody>
<tr><td style="width:28%"><strong>School changes</strong></td><td>A student asked to change their high school (including to &ldquo;Other&rdquo; or homeschool). <em>Approve</em> moves them and applies the new school&rsquo;s steps from then on; <em>Decline</em> leaves them where they are.</td></tr>
<tr><td><strong>ID changes</strong></td><td>High school staff asked to change a student&rsquo;s Shasta College ID. Approve to apply the new ID.</td></tr>
<tr><td><strong>Shared IDs</strong></td><td>The same Shasta College ID is on two or more accounts. Accounts are grouped under the ID with a red bracket on the left; the panel names the other accounts. Correct the ID on the wrong one.</td></tr>
</tbody></table>
''')
body.append('</section>')

# ---------------------------------------------------------------- 9
body.append(h2('terms', '09', 'Terms, registration and archived requests'))
body.append('''<p>Several terms can be open at once (for example Spring and Summer). Students pick a term for every class, and each term has its own registration date. <strong>Register for classes</strong> is confirmed once per term: a student who registered for Spring and later adds a Summer class is asked to register for Summer too.</p>
<table class="compact"><thead><tr><th style="width:30%">Register shows</th><th>When</th></tr></thead><tbody>
<tr><td><strong>Ready to register</strong></td><td>Earlier steps are done, but the term&rsquo;s registration date hasn&rsquo;t arrived.</td></tr>
<tr><td><strong>Registration open</strong></td><td>Registration is open; the student registers in myShasta and confirms here.</td></tr>
<tr><td><strong>Overdue registration</strong></td><td>Open for more than 5 days (counted from the later of the registration date and when the student became ready) without confirming. Shown in red, on its own tab, and the student sees a notice.</td></tr>
</tbody></table>
<p>When a Super Admin turns off registration for a term, requests from students who hadn&rsquo;t registered for it yet are <strong>archived</strong>:</p>''')
body.append(fig(D.archive(), 'Figure 6. What happens when registration for a term is turned off.'))
body.append('<p>Use archived requests to answer &ldquo;why didn&rsquo;t this student get enrolled?&rdquo;. The student sees a short notice explaining that registration for that term was turned off.</p></section>')

# ---------------------------------------------------------------- 10
body.append(h2('help', '10', 'Help requests and notifications'))
body.append('<p>Students can ask for help from their dashboard or any step, and High School Staff can flag a student for help from their panel. Each request says where the student is stuck.</p>')
body.append(fig(D.help_routing(), 'Figure 7. Who is notified about a help request.'))
body.append(steps(
    'Open the <strong>Help</strong> tab (or click the notification) and select the student.',
    'Read the request. Fix the problem in the record if you can.',
    'Write a reply if the student needs to do something, then click <strong>Mark resolved</strong>. The student sees your reply on their dashboard.',
))
body.append('''<h3>Notifications</h3>
<p>Notifications appear under <strong>Notifications</strong> in the menu, with the unread count. When email is set up for the portal they are also emailed. Click <em>Open</em> to go straight to the student; <em>Mark all as read</em> clears the count.</p>
<table class="compact"><thead><tr><th style="width:30%">You receive</th><th>When</th></tr></thead><tbody>
<tr><td>Help requests</td><td>For students at your primary schools, or at schools with no primary admin.</td></tr>
<tr><td>Young student items</td><td>If you are a <em>Young student lead</em>: documents sent; recommendation ready for a decision.</td></tr>
<tr><td>Homeschool items</td><td>If you are a <em>Homeschool lead</em>: new homeschooled student; affidavit uploaded.</td></tr>
</tbody></table>
<p class="small">If no one is set as a lead, Super Admins receive those items so nothing is missed.</p>
</section>''')

# ---------------------------------------------------------------- 11
body.append(h2('rosters', '11', 'Rosters and reports'))
body.append('''
<h3>Roster</h3>
<p>Pick a school (your primary schools are listed first) and a term. View <strong>by class</strong>, which lists every Dual Enrollment section and the Concurrent classes that school&rsquo;s students picked, or <strong>by teacher</strong>. Each student shows their class year, term and the step they are on. Archived requests are labelled. <em>Download CSV</em> exports the view.</p>
<h3>Reports</h3>
<ul class="ticks">
<li><strong>College review tasks completed</strong>: your total, how many were at your primary schools, and how many were outside them.</li>
<li><strong>Average wait on College review</strong> at your primary schools, and the students you cleared most recently.</li>
<li><strong>Seniors&rsquo; plans after high school</strong> (college counselors and Super Admins): this year&rsquo;s 12th graders who answered &ldquo;Do you plan to attend Shasta College after high school?&rdquo;, with a CSV that includes contact information.</li>
</ul>
</section>''')

# ---------------------------------------------------------------- 12
body.append(h2('settings', '12', 'Account settings and designations'))
body.append('''<p>Super Admins set these on the <strong>Users</strong> page. Ask a Super Admin if you need one changed. Your current designations are shown under your name at the bottom of the menu.</p>
<table>
<thead><tr><th style="width:30%">Setting</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><strong>College admin</strong></td><td>Works every queue and every school; corrects records; views rosters and reports.</td></tr>
<tr><td><strong>Super admin</strong></td><td>College admin, plus the tools in chapter 13.</td></tr>
<tr><td><strong>College counselor</strong></td><td>Can decide prerequisite reviews, give young student recommendations, and export seniors&rsquo; plans.</td></tr>
<tr><td><strong>Young Student Approver</strong></td><td>Makes the final decision on young students (must not be the person who recommended).</td></tr>
<tr><td><strong>Young student lead</strong></td><td>Notified about young student items to review.</td></tr>
<tr><td><strong>Homeschool lead</strong></td><td>Notified about homeschool items to review.</td></tr>
<tr><td><strong>Primary schools</strong></td><td>Those schools&rsquo; students are listed first in your queues, count toward your primary-school reports, and their help requests come to you.</td></tr>
</tbody></table>
</section>''')

# ---------------------------------------------------------------- 13
body.append(h2('super', '13', 'Super Admin tools'))
body.append('''
<table>
<thead><tr><th style="width:24%">Page</th><th>What you can do</th></tr></thead>
<tbody>
<tr><td><strong>Users</strong></td><td>Add users and admins; set admin level, designations and primary schools; disable accounts; make a password reset link; unlock locked accounts; set High School Staff type. Each June you are reminded to <strong>retire</strong> the class that graduated four years ago.</td></tr>
<tr><td><strong>Schools</strong></td><td>Add schools; set CCAP or Non-CCAP (this decides high school approval) and CCAP agreement details; set which steps are required or optional; edit each school&rsquo;s Dual Enrollment course list, including period, teacher and the term a section is offered.</td></tr>
<tr><td><strong>Courses</strong></td><td>Upload a school&rsquo;s Dual Enrollment courses for a term from a CSV or Excel file. Download the template, fill in one row per section (Code, Title, Units; optional Period, Teacher, Prerequisite), choose the school and term, and upload. Every row is checked first; nothing is imported if any row has a problem. Also keep the <strong>Concurrent Enrollment list</strong>: listed classes appear as checkboxes for every student (a prerequisite here sends the class to review automatically). Students can still type in any class that isn&rsquo;t listed.</td></tr>
<tr><td><strong>Terms</strong></td><td>Add terms, set registration dates, mark summer terms, and turn registration on or off (which archives unregistered requests; see chapter 9).</td></tr>
<tr><td><strong>Audit</strong></td><td>Paste Shasta College IDs, pick terms, and download one PDF with each student&rsquo;s consent, course requests, approvals, signatures and history for those terms.</td></tr>
</tbody></table>
<h3>Student files: export, then delete</h3>
<p>Files are grouped by graduating class. The ZIP has a folder for each student with their record as a PDF and their stored files, plus an <em>index.csv</em>. Deleting is only offered after a ZIP that includes the class&rsquo;s newest file has been downloaded, and it waits ten minutes so a mistake can be undone.</p>''')
body.append(fig(D.files_timeline(), 'Figure 8. Export, then delete with a 10-minute safety window.'))
body.append('<p class="small"><strong>Before deleting,</strong> check your department&rsquo;s records-retention schedule. Deleting removes stored files (signatures, uploads); accounts and their records stay, and record PDFs note when a signature image is no longer on file.</p>')
body.append('</section>')

# ---------------------------------------------------------------- 14
body.append(h2('faq', '14', 'Quick answers'))
faqs = [
    ('A student says they can&rsquo;t pick classes.', 'Course selection unlocks after parent consent (for students under 18). Check the Parent consent step: the parent may not have accepted the invite yet. Students can resend the invite from that step.'),
    ('A student isn&rsquo;t in my College review queue.', 'Check their steps: they may still be waiting on high school approval, the affidavit, or young student review. CCAP students cleared for the maximum units skip College review for that term.'),
    ('A class disappeared from a student&rsquo;s request.', 'Look under <em>Archived requests</em> on their panel (registration for that term was turned off), or check whether a reviewer declined it; the student&rsquo;s note history explains why.'),
    ('An outside approver says their link doesn&rsquo;t work.', 'Links expire after 90 days and are replaced whenever a new one is sent. Open the student and click <em>Send a new approval link</em>.'),
    ('Parent consent is on paper.', 'Use <em>Mark complete</em> on the Parent consent step. It is recorded as &ldquo;On file with Shasta College&rdquo;.'),
    ('The same Shasta College ID is on two accounts.', 'Open the <em>Shared IDs</em> tab, compare the accounts, and correct the ID on the wrong one.'),
    ('A student is at the wrong school.', 'Use <em>School</em> on their panel to move them. The new school&rsquo;s steps apply from then on.'),
]
body.append('<div class="faq">' + ''.join(f'<div class="q">{q}</div><div class="a">{a}</div>' for q, a in faqs) + '</div>')
body.append('''<h3>Glossary</h3>
<table class="compact"><tbody>
<tr><td style="width:28%"><strong>DE</strong></td><td>Dual Enrollment: a Shasta College class taught at the student&rsquo;s high school, with a period and teacher.</td></tr>
<tr><td><strong>CE</strong></td><td>Concurrent Enrollment: a Shasta College class taught at the college; students pick it from the list or type in the course code and units.</td></tr>
<tr><td><strong>CCAP</strong></td><td>College and Career Access Pathways agreement between Shasta College and a school district.</td></tr>
<tr><td><strong>Primary school</strong></td><td>A school assigned to a College Admin; its students come to them first.</td></tr>
<tr><td><strong>Archived request</strong></td><td>A class request taken out of the workflow because registration for its term was turned off before the student registered.</td></tr>
</tbody></table>
</section>''')

# ---------------------------------------------------------------- contents
def toc():
    rows = ''.join(
        f'<a class="toc-row" href="#{sid}"><span class="toc-num">{num}</span><span class="toc-title">{t}</span><span class="toc-dots"></span><span class="toc-page">{pages.get(sid, "")}</span></a>'
        for sid, num, t in SECTIONS)
    return f'<section class="toc"><div class="kicker">Contents</div><h2 class="toc-h">In this guide</h2>{rows}</section>'


css = (HERE / 'guide.css').read_text()
html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dual Enrollment Portal · College Admin Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>{css}</style></head><body>
<section class="cover">
  <div class="cover-top"><div class="mark"></div><div class="brand">Shasta College</div><div class="brand-sep"></div><div class="brand-sub">Dual Enrollment</div></div>
  <div class="cover-main">
    <div class="kicker light">Staff guide · College Admin</div>
    <h1>Dual Enrollment<br>Portal</h1>
    <p class="cover-lead">How the student workflow works, how to work each review queue, and what your settings do.</p>
  </div>
  <div class="cover-bars"><span></span><span></span><span></span><span></span><span class="half"></span><span class="off"></span></div>
  <div class="cover-foot"><div><strong>For</strong> College Admins and Super Admins</div><div><strong>Edition</strong> November 2026</div><div><strong>Applies to</strong> the 2026–27 school year</div></div>
</section>
{toc()}
{''.join(body)}
<section class="back"><div class="mark"></div><p><strong>Shasta College · Dual Enrollment</strong><br>Questions about this guide or the portal: Shasta College Outreach.</p></section>
</body></html>'''
(HERE / 'guide.html').write_text(html)
(HERE / 'sections.json').write_text(json.dumps([[s, n, t] for s, n, t in SECTIONS]))
print('wrote guide.html with', len(SECTIONS), 'chapters')
