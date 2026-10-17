"""
Schedule I/O Service (PDF and Excel timetable export and import)

Extracts ReportLab and openpyxl file generation and parsing out of the
HTTP router layer.
"""

from typing import List, Optional, Any, Tuple
from datetime import datetime
import io
import re
from xml.sax.saxutils import escape as xml_escape
import openpyxl
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .. import models


def _attachment_header(stem: str, ext: str) -> dict:
    """
    A Content-Disposition a browser will accept.

    `filename=schedule_College_of_Arts,_Sciences_&_Technology.pdf` was being sent
    unquoted, and a comma is a header-value separator: Chrome read it as two
    Content-Disposition headers and refused the whole response
    (ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION). Every college at DLSAU
    has a comma in its name, so the PDF and Excel exports failed for all of them.
    Reduced to a safe ASCII stem, and quoted.
    """
    safe = re.sub(r'[^A-Za-z0-9._-]+', '_', stem).strip('_') or 'schedule'
    return {"Content-Disposition": f'attachment; filename="{safe}.{ext}"'}


attachment_header = _attachment_header


def build_schedule_pdf(
    schedules: List[Any],
    dept_name: str,
    term_label: str,
    faculty_name: Optional[str] = None
) -> Tuple[io.BytesIO, int]:
    """
    Export schedules to a landscape PDF buffer.
    Returns (buffer, row_count).
    """
    # Resolve each row once, then sort the way the preview does: professor,
    # then the week in order, then time of day.
    day_order = {d: i for i, d in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])}
    rows = []
    for s in schedules:
        curriculum_item = s.curriculum
        faculty = s.faculty
        room = s.room

        prof = f"{faculty.first_name} {faculty.last_name}" if faculty else "TBA"
        if faculty_name and prof != faculty_name:
            continue

        rows.append({
            "professor": prof,
            "code": curriculum_item.code if curriculum_item else "N/A",
            "name": curriculum_item.name if curriculum_item else "N/A",
            "day": str(s.day_of_week or ""),
            "start": s.start_time.strftime('%I:%M %p').lstrip('0') if s.start_time else "",
            "end": s.end_time.strftime('%I:%M %p').lstrip('0') if s.end_time else "",
            "room": room.name if room else "No room assigned",
            "building": room.building if room else "",
            "section": s.section or "",
            "_sort": (prof, day_order.get(str(s.day_of_week or "")[:3], 9),
                      s.start_time.strftime('%H:%M') if s.start_time else ""),
        })
    rows.sort(key=lambda r: r["_sort"])

    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(letter),
        leftMargin=24, rightMargin=24, topMargin=28, bottomMargin=28,
    )
    elements = []
    styles = getSampleStyleSheet()
    cell = ParagraphStyle('cell', parent=styles['Normal'], fontSize=7.5, leading=9.5)

    def cell_text(value):
        """
        reportlab parses a Paragraph's text as mini-HTML, so any '<' or '&' in
        real data is markup. A subject named 'Data Structures #2 <Lab>' lost the
        '<Lab>' silently as an unknown tag, and a stray '<' can abort the whole
        render. Escaping first means the file says what the database says.
        """
        return xml_escape(str(value if value is not None else ''))

    scope_line = faculty_name if faculty_name else "All professors"
    elements.append(Paragraph(cell_text(f"ATLAS Schedule — {dept_name}"), styles['Title']))
    elements.append(Paragraph(cell_text(
        f"{term_label} · {scope_line} · {len(rows)} classes · "
        f"generated {datetime.now().strftime('%d %b %Y %H:%M')}"
    ), styles['Normal']))
    elements.append(Paragraph("<br/>", styles['Normal']))

    header = ["Professor", "Subject Code", "Subject Name", "Day",
              "Start Time", "End Time", "Room", "Building", "Section"]
    data: list[Any] = [header]
    for r in rows:
        data.append([
            Paragraph(cell_text(r["professor"]), cell),
            Paragraph(cell_text(r["code"]), cell),
            Paragraph(cell_text(r["name"]), cell),
            Paragraph(cell_text(r["day"]), cell),
            Paragraph(cell_text(r["start"]), cell),
            Paragraph(cell_text(r["end"]), cell),
            Paragraph(cell_text(r["room"]), cell),
            Paragraph(cell_text(r["building"]), cell),
            Paragraph(cell_text(r["section"]), cell),
        ])

    if not rows:
        elements.append(Paragraph("No classes are scheduled for this selection.", styles['Normal']))
    else:
        t = Table(data, repeatRows=1,
                  colWidths=[95, 62, 175, 55, 58, 58, 82, 72, 45])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0d3b26')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7.5),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f4f6f5')]),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#c9d2cd')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)

    doc.build(elements)
    buffer.seek(0)
    return buffer, len(rows)


def build_schedule_excel(schedules: List[Any]) -> io.BytesIO:
    """
    Export schedules to an Excel workbook buffer.
    """
    export_data = []
    headers = ["Curriculum Code", "Subject Name", "Section", "Faculty", "Room", "Day", "Start Time", "End Time", "Status", "Locked"]
    for s in schedules:
        curriculum_item = s.curriculum
        faculty = s.faculty
        room = s.room
        
        export_data.append({
            "Curriculum Code": curriculum_item.code if curriculum_item else "N/A",
            "Subject Name": curriculum_item.name if curriculum_item else "N/A",
            "Section": s.section,
            "Faculty": f"{faculty.first_name} {faculty.last_name}" if faculty else "TBA",
            "Room": room.name if room else "N/A",
            "Day": s.day_of_week,
            "Start Time": s.start_time.strftime('%I:%M %p') if s.start_time else "",
            "End Time": s.end_time.strftime('%I:%M %p') if s.end_time else "",
            "Status": s.status,
            "Locked": "Yes" if s.is_locked else "No"
        })
    
    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:
        ws = wb.create_sheet("Schedules")
    ws.title = "Schedules"
    ws.append(headers)
    
    for item in export_data:
        ws.append([item[h] for h in headers])
        
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def import_schedules_from_excel(
    contents: bytes,
    db: Session,
    semester_id: int
) -> Tuple[int, List[str]]:
    """
    Parse and insert schedules from an uploaded Excel file.
    Expects columns: CurriculumCode, FacultyEmail, RoomName, Day, StartTime, EndTime, Section
    Returns (success_count, errors).
    """
    wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    sheet = wb.active
    if sheet is None:
        raise HTTPException(status_code=400, detail="Excel sheet not found")
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Excel file is empty")
    
    # Basic validation
    header = [str(cell).strip() if cell is not None else "" for cell in rows[0]]
    required_cols = ['CurriculumCode', 'FacultyEmail', 'RoomName', 'Day', 'StartTime', 'EndTime', 'Section']
    col_indices = {}
    for col in required_cols:
        if col not in header:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        col_indices[col] = header.index(col)
            
    success_count = 0
    errors = []

    def _index(rows_, key):
        out = {}
        for r in rows_:
            k = getattr(r, key)
            if k and k not in out:
                out[k] = r
        return out

    curriculum_by_code = _index(db.query(models.Curriculum).order_by(models.Curriculum.id).all(), "code")
    faculty_by_email = _index(db.query(models.Faculty).order_by(models.Faculty.id).all(), "email")
    room_by_name = _index(db.query(models.Room).order_by(models.Room.id).all(), "name")

    for index, row in enumerate(rows[1:], start=2):
        if not row or all(v is None for v in row):
            continue
        try:
            curr_code = str(row[col_indices['CurriculumCode']]).strip() if row[col_indices['CurriculumCode']] is not None else ""
            fac_email = str(row[col_indices['FacultyEmail']]).strip() if row[col_indices['FacultyEmail']] is not None else ""
            rm_name = str(row[col_indices['RoomName']]).strip() if row[col_indices['RoomName']] is not None else ""
            day_val = str(row[col_indices['Day']]).strip() if row[col_indices['Day']] is not None else ""
            start_val = row[col_indices['StartTime']]
            end_val = row[col_indices['EndTime']]
            sec_val = str(row[col_indices['Section']]).strip() if row[col_indices['Section']] is not None else ""

            curriculum_item = curriculum_by_code.get(curr_code)
            faculty = faculty_by_email.get(fac_email)
            room = room_by_name.get(rm_name)
            
            if not curriculum_item or not faculty or not room:
                errors.append(f"Row {index}: Entity not found (Curriculum: {curriculum_item is not None}, Faculty: {faculty is not None}, Room: {room is not None})")
                continue
                
            def parse_time_val(t_val):
                if isinstance(t_val, datetime):
                    return t_val.time()
                if hasattr(t_val, 'hour'):
                    return t_val
                if isinstance(t_val, str):
                    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p"):
                        try:
                            return datetime.strptime(t_val.strip(), fmt).time()
                        except ValueError:
                            pass
                return datetime.strptime(str(t_val).strip(), "%H:%M:%S").time()

            start_t = parse_time_val(start_val)
            end_t = parse_time_val(end_val)
            
            new_sched = models.Schedule(
                semester_id=semester_id,
                curriculum_id=curriculum_item.id,
                faculty_id=faculty.id,
                room_id=room.id,
                day_of_week=day_val,
                start_time=start_t,
                end_time=end_t,
                section=sec_val,
                status='draft'
            )
            db.add(new_sched)
            success_count += 1
        except Exception as e:
            errors.append(f"Row {index}: {str(e)}")
            
    db.commit()
    return success_count, errors
