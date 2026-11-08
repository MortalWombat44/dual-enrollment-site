"""Workflow diagrams for the College Admin guide, drawn as inline SVG (brand: Shasta green, Archivo)."""
from html import escape

GREEN, GREEN_D, GREEN_L, INK, MUTED, LINE, AMBER, AMBER_L, RED_L = '#0f6b43', '#0a4a2e', '#eaf5ee', '#201e1d', '#6b6866', '#c9c6c4', '#8a4b00', '#fff4e0', '#fdecea'
FONT = "Archivo, 'Helvetica Neue', Arial, sans-serif"


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []

    def box(self, x, y, w, h, lines, kind='step', sub=None):
        fill, stroke, color, dash = {
            'step': ('#ffffff', INK, INK, ''),
            'start': (GREEN, GREEN, '#ffffff', ''),
            'done': (GREEN_L, GREEN, GREEN_D, ''),
            'cond': ('#ffffff', GREEN, INK, '6 4'),
            'warn': (AMBER_L, AMBER, AMBER, ''),
            'back': (RED_L, '#b3261e', '#6b1a12', ''),
            'note': ('#f6f5f4', LINE, MUTED, ''),
        }[kind]
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.6"{f" stroke-dasharray={chr(34)}{dash}{chr(34)}" if dash else ""}/>')
        lines = [lines] if isinstance(lines, str) else lines
        n = len(lines) + (1 if sub else 0)
        lh = 15
        y0 = y + h / 2 - (n - 1) * lh / 2 + 4.5
        for i, t in enumerate(lines):
            self.parts.append(f'<text x="{x + w / 2}" y="{y0 + i * lh}" text-anchor="middle" font-family="{FONT}" font-size="12.5" font-weight="700" fill="{color}">{escape(t)}</text>')
        if sub:
            self.parts.append(f'<text x="{x + w / 2}" y="{y0 + len(lines) * lh}" text-anchor="middle" font-family="{FONT}" font-size="10.5" fill="{color if kind == "start" else MUTED}">{escape(sub)}</text>')

    def diamond(self, cx, cy, w, h, lines):
        pts = f'{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}'
        self.parts.append(f'<polygon points="{pts}" fill="#ffffff" stroke="{GREEN}" stroke-width="1.6"/>')
        lines = [lines] if isinstance(lines, str) else lines
        y0 = cy - (len(lines) - 1) * 7 + 4
        for i, t in enumerate(lines):
            self.parts.append(f'<text x="{cx}" y="{y0 + i * 14}" text-anchor="middle" font-family="{FONT}" font-size="11.5" font-weight="700" fill="{INK}">{escape(t)}</text>')

    def arrow(self, pts, label=None, lx=None, ly=None, color=INK, dashed=False):
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6"{" stroke-dasharray=\"5 4\"" if dashed else ""} marker-end="url(#ah{"g" if color == GREEN else "r" if color == "#b3261e" else ""})"/>')
        if label:
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            lx = lx if lx is not None else (x1 + x2) / 2 + 6
            ly = ly if ly is not None else (y1 + y2) / 2 - 5
            self.parts.append(f'<text x="{lx}" y="{ly}" font-family="{FONT}" font-size="10.5" font-weight="700" fill="{color if color != INK else GREEN_D}">{escape(label)}</text>')

    def text(self, x, y, t, size=10.5, color=MUTED, anchor='start', weight=400):
        self.parts.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}">{escape(t)}</text>')

    def render(self):
        defs = ''.join(
            f'<marker id="ah{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
            for k, c in (('', INK), ('g', GREEN), ('r', '#b3261e')))
        return f'<svg viewBox="0 0 {self.w} {self.h}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img"><defs>{defs}</defs>{"".join(self.parts)}</svg>'


def journey():
    """The student's steps, top to bottom, with who acts and when a step applies."""
    s = Svg(700, 640)
    rows = [
        ('01', 'Apply on CCCApply', 'Student · once ever · gives Shasta College ID', 'step', None),
        ('02', 'Parent consent', 'Parent signs online · one-time', 'cond', 'Skipped if the student is 18+ today'),
        ('03', 'Course selection', 'Student · Dual Enrollment + Concurrent (listed or typed in)', 'step', None),
        ('04', 'High school approval', 'HS staff, or outside approver by link · per class, per term', 'cond', 'Non-CCAP and "Other" schools only'),
        ('··', 'Private School Affidavit', 'Student or parent uploads · college admin reviews', 'cond', 'Homeschooled students only'),
        ('··', 'Young student documents + review', 'Counselor recommends · approver decides', 'cond', '8th grade and below only'),
        ('05', 'College review & clear units', 'College admin verifies in Colleague · alongside prerequisites', 'step', None),
        ('06', 'Prerequisite review', 'College counselor · per class, per term', 'cond', 'Classes with (or flagged for) a prerequisite'),
        ('07', 'Register for classes', 'Per term · Ready to register → open → overdue after 5 days', 'step', None),
    ]
    y = 14
    for i, (num, name, sub, kind, cond) in enumerate(rows):
        s.box(70, y, 360, 48, name, kind, sub)
        s.parts.append(f'<circle cx="34" cy="{y + 24}" r="9" fill="{GREEN if kind == "step" else "#ffffff"}" stroke="{GREEN}" stroke-width="2"/>')
        if cond:
            s.parts.append(f'<rect x="450" y="{y + 11}" width="236" height="26" rx="13" fill="{GREEN_L}"/>')
            s.text(568, y + 28, cond, 10.5, GREEN_D, 'middle', 700)
            s.arrow([(430, y + 24), (448, y + 24)], color=GREEN)
        if i < len(rows) - 1:
            s.arrow([(250, y + 48), (250, y + 64)])
        y += 64
    s.box(70, y, 360, 34, 'Ready for class', 'start')
    # Legend
    s.parts.append(f'<circle cx="460" cy="{y + 10}" r="6" fill="{GREEN}" stroke="{GREEN}" stroke-width="2"/>')
    s.text(474, y + 14, 'Every student', 10.5, INK)
    s.parts.append(f'<circle cx="460" cy="{y + 28}" r="6" fill="#ffffff" stroke="{GREEN}" stroke-width="2"/>')
    s.text(474, y + 32, 'Only some students', 10.5, INK)
    return s.render()


def clear_units():
    s = Svg(700, 246)
    s.box(10, 20, 150, 56, ['Student lands in', 'College review queue'], 'start')
    s.arrow([(160, 48), (196, 48)])
    s.box(196, 20, 170, 56, ['Check plan; verify ID,', 'SACP, RGPE, STAL'], 'step', 'in Colleague')
    s.arrow([(366, 48), (402, 48)])
    s.diamond(470, 48, 136, 76, ['All OK?'])
    s.arrow([(538, 48), (574, 48)], 'Yes', 546, 40, GREEN)
    s.box(574, 20, 116, 56, ['All verified &', 'units cleared'], 'done')
    s.arrow([(470, 86), (470, 136)], 'No', 478, 116, '#b3261e')
    s.box(380, 136, 180, 56, 'Send back to student', 'back', 'note is required')
    s.arrow([(380, 164), (300, 164)], color='#b3261e')
    s.box(130, 136, 170, 56, ['Course selection', 'reopens'], 'step', 'student sees your note')
    s.arrow([(215, 136), (215, 100), (215, 77)], 'Resubmits', 222, 112)
    s.box(574, 136, 116, 70, ['CCAP only:', 'max-units box'], 'cond', 'skips later reviews')
    s.arrow([(632, 76), (632, 134)], dashed=True, color=GREEN)
    s.text(10, 232, 'Unit limits per term (a note, never a block): CCAP 15 · Non-CCAP 11 · Non-CCAP summer 7.', 11, INK, weight=700)
    return s.render()


def hs_approval():
    s = Svg(700, 330)
    s.box(10, 62, 150, 56, ['Classes submitted', '(each one pending)'], 'start')
    s.arrow([(160, 90), (186, 90)])
    s.diamond(256, 90, 140, 80, ['Which kind', 'of school?'])
    s.arrow([(326, 90), (346, 90), (346, 36), (380, 36)])
    s.box(380, 10, 280, 52, 'Listed Non-CCAP school', 'step', 'High School Staff decide in their queue')
    s.arrow([(326, 90), (346, 90), (346, 110), (380, 110)])
    s.box(380, 84, 280, 52, 'Unlisted ("Other") school', 'step', 'named approver uses an emailed link')
    s.arrow([(256, 130), (256, 176)])
    s.text(264, 158, 'CCAP or homeschool', 10.5, GREEN_D, weight=700)
    s.box(166, 176, 180, 40, 'No high school approval', 'note')
    s.arrow([(660, 36), (684, 36), (684, 186), (662, 186)])
    s.arrow([(660, 110), (684, 110)])
    s.box(380, 160, 280, 52, 'Approve or decline each class', 'step', 'sign once for the batch')
    s.arrow([(460, 212), (460, 262)], color='#b3261e')
    s.text(468, 244, 'Any declined', 10.5, '#b3261e', weight=700)
    s.box(330, 262, 210, 52, ['Declined classes removed', 'student picks again'], 'back')
    s.arrow([(610, 212), (610, 262)], color=GREEN)
    s.text(618, 244, 'All approved', 10.5, GREEN_D, weight=700)
    s.box(560, 262, 130, 52, 'Step complete', 'done')
    s.text(10, 262, 'Approvals stay with each class.', 10.5, INK, weight=700)
    s.text(10, 278, 'A class added later, or moved to', 10.5)
    s.text(10, 294, 'another term, needs approval again.', 10.5)
    return s.render()


def young():
    s = Svg(700, 250)
    s.box(10, 30, 150, 60, ['Student uploads', 'report card + letter'], 'start', 'principal names the class')
    s.arrow([(160, 60), (196, 60)])
    s.box(196, 30, 160, 60, ['College counselor', 'recommends (or not)'], 'step', 'feedback required')
    s.arrow([(356, 60), (392, 60)])
    s.box(392, 30, 150, 60, ['Young Student', 'Approver decides'], 'step', 'must be a different admin')
    s.arrow([(542, 60), (566, 60), (566, 92), (580, 92)], color=GREEN)
    s.text(548, 52, 'Approve', 10.5, GREEN_D, weight=700)
    s.box(580, 68, 110, 48, 'College review', 'done')
    s.arrow([(467, 90), (467, 140)], 'Decline', 475, 122, '#b3261e')
    s.box(360, 140, 214, 56, ['Back to course selection', 'documents sent again'], 'back', 'note is required')
    s.text(10, 225, 'Leads flagged "Young student lead" are notified when documents arrive and when a recommendation is ready.', 10.5)
    return s.render()


def affidavit():
    s = Svg(700, 200)
    s.box(10, 30, 170, 60, ['Student or parent', 'uploads affidavit'], 'start', 'any time; PDF, JPG or PNG')
    s.arrow([(180, 60), (216, 60)])
    s.box(216, 30, 170, 60, ['Homeschool tab', '(review queue)'], 'step', 'Homeschool lead notified')
    s.arrow([(386, 60), (422, 60)])
    s.diamond(490, 60, 136, 76, ['Valid for', 'this year?'])
    s.arrow([(558, 60), (576, 60), (576, 96), (594, 96)], color=GREEN)
    s.text(562, 52, 'Approve', 10.5, GREEN_D, weight=700)
    s.box(594, 72, 96, 48, 'Step done', 'done')
    s.arrow([(490, 98), (490, 130), (300, 130), (300, 92)], 'Decline with note', 330, 124, '#b3261e')
    s.text(10, 175, 'The affidavit must be approved before College review. A declined affidavit shows your note to the student and parent.', 10.5)
    return s.render()


def help_routing():
    s = Svg(700, 230)
    s.box(10, 20, 170, 60, ['Student or HS staff', 'sends "I need help"'], 'start', 'says where they’re stuck')
    s.arrow([(180, 50), (216, 50)])
    s.diamond(310, 50, 188, 84, ['Does anyone have', 'this school as primary?'])
    s.arrow([(404, 50), (450, 50), (450, 30), (470, 30)], 'Yes', 418, 22, GREEN)
    s.box(470, 8, 220, 40, 'Those admins are notified', 'step')
    s.arrow([(404, 50), (450, 50), (450, 82), (470, 82)], 'No', 418, 100)
    s.box(470, 62, 220, 40, 'Every college admin is notified', 'step')
    s.arrow([(580, 102), (580, 140)])
    s.box(430, 140, 260, 56, ['Help tab: reply and Mark resolved'], 'done', 'the student sees your reply')
    s.text(10, 140, 'The Help tab appears on the Students page', 10.5, INK, weight=700)
    s.text(10, 156, 'whenever any request is open. Everyone can', 10.5)
    s.text(10, 172, 'see and resolve it; routing only decides who', 10.5)
    s.text(10, 188, 'gets the notification.', 10.5)
    return s.render()


def archive():
    s = Svg(700, 220)
    s.box(10, 30, 170, 56, ['Super admin turns off', 'registration for a term'], 'start')
    s.arrow([(180, 58), (216, 58)])
    s.diamond(300, 58, 168, 80, ['Student registered', 'for that term?'])
    s.arrow([(384, 58), (420, 58), (420, 28), (440, 28)], 'Yes', 392, 20, GREEN)
    s.box(440, 8, 250, 40, 'Classes kept as they are', 'done')
    s.arrow([(384, 58), (420, 58), (420, 90), (440, 90)], 'No', 392, 108)
    s.box(440, 68, 250, 48, ['Requests archived', '(visible to staff, out of workflow)'], 'warn')
    s.arrow([(565, 116), (565, 150)])
    s.box(440, 150, 250, 50, ['No active classes left?', '→ back to Course selection'], 'step')
    s.text(10, 140, 'Archived requests show on the student panel,', 10.5)
    s.text(10, 156, 'the HS staff panel, the roster and the audit', 10.5)
    s.text(10, 172, 'PDF, with the reason. Requesting the same class', 10.5)
    s.text(10, 188, 'again later starts it fresh.', 10.5)
    return s.render()


def files_timeline():
    s = Svg(700, 150)
    s.box(10, 30, 140, 56, 'Download ZIP', 'start', 'per graduating class')
    s.arrow([(150, 58), (186, 58)])
    s.box(186, 30, 140, 56, 'Delete files…', 'step', 'unlocks after the ZIP')
    s.arrow([(326, 58), (362, 58)])
    s.box(362, 30, 160, 56, '10:00 countdown', 'warn', 'Cancel deletion any time')
    s.arrow([(522, 58), (558, 58)])
    s.box(558, 30, 132, 56, 'Files deleted', 'done', 'accounts + records kept')
    s.arrow([(442, 86), (442, 112)], dashed=True, color='#b3261e')
    s.text(442, 128, 'Cancel → nothing is deleted', 10.5, '#6b1a12', 'middle', 700)
    return s.render()
