"""Two-pass build: render, find chapter pages, rebuild contents, render again, add footers."""
import json, subprocess, io, re
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

H = Path(__file__).parent
def build_and_render():
    subprocess.run(['python3', 'build.py'], cwd=H, check=True)
    subprocess.run(['node', 'render.js'], cwd=H, check=True)

(H / 'toc-pages.json').unlink(missing_ok=True)
build_and_render()
sections = json.loads((H / 'sections.json').read_text())
for _ in range(2):  # second pass in case filling the numbers shifted anything
    texts = [re.sub(r'\s+', ' ', pg.extract_text() or '') for pg in PdfReader(H / 'body.pdf').pages]
    pages = {}
    for sid, num, title in sections:
        t = re.sub(r'<[^>]+>', '', title).replace('&rsquo;', '’').replace('&amp;', '&')
        for i in range(2, len(texts)):
            if texts[i].lstrip().startswith(num) and t.split(',')[0] in texts[i][:200]:
                pages[sid] = i + 1
                break
    (H / 'toc-pages.json').write_text(json.dumps(pages))
    build_and_render()
print('chapter pages:', pages)

# Footer on every page except the cover (and the back page): guide title + page number.
reader = PdfReader(H / 'body.pdf')
writer = PdfWriter()
n = len(reader.pages)
for i, page in enumerate(reader.pages):
    if 0 < i < n - 1:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter
        c.setStrokeColorRGB(0.87, 0.86, 0.85); c.setLineWidth(0.7); c.line(61, 40, w - 61, 40)
        c.setFont('Helvetica', 7.5); c.setFillColorRGB(0.42, 0.41, 0.40)
        c.drawString(61, 28, 'SHASTA COLLEGE  ·  DUAL ENROLLMENT PORTAL  ·  COLLEGE ADMIN GUIDE')
        c.setFont('Helvetica-Bold', 8.5); c.setFillColorRGB(0.06, 0.42, 0.26)
        c.drawRightString(w - 61, 28, str(i + 1))
        c.save(); buf.seek(0)
        page.merge_page(PdfReader(buf).pages[0])
    writer.add_page(page)
writer.add_metadata({'/Title': 'Dual Enrollment Portal – College Admin Guide', '/Author': 'Shasta College Dual Enrollment', '/Subject': 'Staff guide for College Admins and Super Admins'})
out = H.parent / 'College-Admin-Guide.pdf'
out.parent.mkdir(exist_ok=True)
with open(out, 'wb') as f: writer.write(f)
print('pages:', n, '->', out)
