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
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
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


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas that determines total page count dynamically
    and paints a consistent institutional header and footer on each page.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()  # type: ignore

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        # Top institutional rule (Forest Green with Gold accent)
        self.setStrokeColor(colors.HexColor('#05301F'))
        self.setLineWidth(2)
        self.line(30, 584, 762, 584)
        self.setStrokeColor(colors.HexColor('#C8A227'))
        self.setLineWidth(1)
        self.line(30, 581, 762, 581)

        # Bottom footer rule
        self.setStrokeColor(colors.HexColor('#CBD5E1'))
        self.setLineWidth(0.5)
        self.line(30, 24, 762, 24)

        # Footer text
        self.setFont('Helvetica', 8)
        self.setFillColor(colors.HexColor('#64748B'))
        self.drawString(30, 14, 'De La Salle Araneta University · ATLAS Timetable & Allocation System · Official Document')
        self.drawRightString(762, 14, f'Page {self._pageNumber} of {page_count}')  # type: ignore
        self.restoreState()


def build_schedule_pdf(
    schedules: List[Any],
    dept_name: str,
    term_label: str,
    faculty_name: Optional[str] = None
) -> Tuple[io.BytesIO, int]:
    """
    Export schedules to a landscape PDF buffer with institutional DLSAU styling.
    Returns (buffer, row_count).
    """
    day_order = {d: i for i, d in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])}
    rows = []
    unique_profs = set()
    for s in schedules:
        curriculum_item = s.curriculum
        faculty = s.faculty

        prof = f"{faculty.first_name} {faculty.last_name}" if faculty else "TBA"
        if faculty_name and prof != faculty_name:
            continue

        if faculty:
            unique_profs.add(prof)

        rows.append({
            "professor": prof,
            "code": curriculum_item.code if curriculum_item else "N/A",
            "name": curriculum_item.name if curriculum_item else "N/A",
            "section": s.section or "—",
            "day": str(s.day_of_week or "—"),
            "start": s.start_time.strftime('%I:%M %p').lstrip('0') if s.start_time else "—",
            "end": s.end_time.strftime('%I:%M %p').lstrip('0') if s.end_time else "—",
            "_sort": (prof, day_order.get(str(s.day_of_week or "")[:3], 9),
                      s.start_time.strftime('%H:%M') if s.start_time else ""),
        })
    rows.sort(key=lambda r: r["_sort"])

    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(letter),
        leftMargin=30, rightMargin=30, topMargin=36, bottomMargin=36,
    )
    elements = []
    styles = getSampleStyleSheet()

    # Typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#05301F')
    )
    inst_style = ParagraphStyle(
        'DocInst',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#C8A227')
    )
    sub_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#475569')
    )
    meta_val = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#1E293B')
    )
    cell_style = ParagraphStyle(
        'CellNorm',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0F172A')
    )
    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#05301F')
    )
    cell_center = ParagraphStyle(
        'CellCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0F172A'),
        alignment=1
    )
    cell_center_bold = ParagraphStyle(
        'CellCenterBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#05301F'),
        alignment=1
    )

    def cell_text(value):
        return xml_escape(str(value if value is not None else ''))

    scope_line = faculty_name if faculty_name else "All Faculty Members"

    # Institutional Header
    elements.append(Paragraph("DE LA SALLE ARANETA UNIVERSITY", inst_style))
    elements.append(Paragraph("OFFICIAL CLASS TIMETABLE &amp; FACULTY LOAD", title_style))
    elements.append(Paragraph("Automated Timetable &amp; Load Allocation System (ATLAS)", sub_style))
    elements.append(Spacer(1, 6))

    # Summary Metadata Bar
    meta_data = [
        [
            Paragraph(f"<b>Department:</b> {cell_text(dept_name)}", meta_val),
            Paragraph(f"<b>Academic Term:</b> {cell_text(term_label or 'Active Term')}", meta_val),
            Paragraph(f"<b>Faculty Scope:</b> {cell_text(scope_line)}", meta_val),
            Paragraph(f"<b>Total Classes:</b> {len(rows)} scheduled", meta_val),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[210, 180, 180, 162])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F2F7F4')),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#C8D9CF')),
        ('LINEBEFORE', (1, 0), (-1, -1), 0.5, colors.HexColor('#DDE7E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 8))

    # Main Data Table
    header = ["Professor", "Subject Code", "Subject Name", "Section", "Day",
              "Start Time", "End Time"]
    data: list[Any] = [header]
    for r in rows:
        data.append([
            Paragraph(cell_text(r["professor"]), cell_bold),
            Paragraph(cell_text(r["code"]), cell_center_bold),
            Paragraph(cell_text(r["name"]), cell_style),
            Paragraph(cell_text(r["section"]), cell_center),
            Paragraph(cell_text(r["day"]), cell_center_bold),
            Paragraph(cell_text(r["start"]), cell_center),
            Paragraph(cell_text(r["end"]), cell_center),
        ])

    if not rows:
        elements.append(Paragraph("No classes are scheduled for this selection.", styles['Normal']))
    else:
        t = Table(data, repeatRows=1,
                  colWidths=[130, 80, 222, 60, 70, 85, 85])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#05301F')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7.5),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#C8A227')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F4F8F5')]),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#D5DFD9')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)

        # Certification sign-off block
        sig_text_1 = Paragraph(
            "<b>Certified Correct:</b><br/><br/><br/><br/>"
            "_____________________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br/>"
            "<b>Program Chair</b><br/>"
            "Date: ________________________",
            meta_val
        )
        sig_text_2 = Paragraph(
            "<b>Approved by:</b><br/><br/><br/><br/>"
            "_____________________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br/>"
            "<b>Dean / Vice Chancellor for Academic Affairs</b><br/>"
            "Date: ________________________",
            meta_val
        )
        sig_table = Table([[sig_text_1, sig_text_2]], colWidths=[366, 366])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 16),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(KeepTogether(sig_table))

    doc.build(elements, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer, len(rows)


def build_schedule_excel(
    schedules: List[Any],
    dept_name: str = "All Departments",
    term_label: str = "",
    faculty_name: Optional[str] = None
) -> Tuple[io.BytesIO, int]:
    """
    Export schedules to an Excel workbook buffer styled with institutional branding.
    Returns (buffer, row_count).
    """
    day_order = {d: i for i, d in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])}
    rows = []
    unique_profs = set()

    for s in schedules:
        curriculum_item = s.curriculum
        faculty = s.faculty

        prof = f"{faculty.first_name} {faculty.last_name}" if faculty else "TBA"
        if faculty_name and prof != faculty_name:
            continue

        if faculty:
            unique_profs.add(prof)

        rows.append({
            "professor": prof,
            "code": curriculum_item.code if curriculum_item else "N/A",
            "name": curriculum_item.name if curriculum_item else "N/A",
            "section": s.section or "—",
            "day": str(s.day_of_week or "—"),
            "start": s.start_time.strftime('%I:%M %p').lstrip('0') if s.start_time else "—",
            "end": s.end_time.strftime('%I:%M %p').lstrip('0') if s.end_time else "—",
            "_sort": (prof, day_order.get(str(s.day_of_week or "")[:3], 9),
                      s.start_time.strftime('%H:%M') if s.start_time else ""),
        })
    rows.sort(key=lambda r: r["_sort"])

    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:
        ws = wb.create_sheet("Schedule")
    ws.title = "Class Timetable"
    ws.views.sheetView[0].showGridLines = True

    # Title Banner (Rows 1-3)
    scope_line = faculty_name if faculty_name else "All Faculty Members"
    now_str = datetime.now().strftime('%B %d, %Y %I:%M %p')

    banner_data = [
        ('DE LA SALLE ARANETA UNIVERSITY', 11, True, 'C8A227', 22),
        ('OFFICIAL CLASS TIMETABLE & FACULTY LOAD', 16, True, 'FFFFFF', 28),
        (f"{dept_name}   ·   {term_label or 'Active Term'}   ·   {scope_line}   ·   Generated {now_str}", 9.5, False, 'D0DFD6', 20),
    ]

    for r, (txt, sz, bold, color, h) in enumerate(banner_data, start=1):
        top_cell = ws.cell(row=r, column=1, value=txt)
        top_cell.font = Font(name='Segoe UI', size=sz, bold=bold, color=color)
        top_cell.fill = PatternFill(start_color='05301F', end_color='05301F', fill_type='solid')
        top_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
        ws.row_dimensions[r].height = h
        if r == 3:
            gold_border = Border(bottom=Side(style='medium', color='C8A227'))
            for col in range(1, 8):
                ws.cell(row=r, column=col).border = gold_border

    ws.row_dimensions[4].height = 8

    # KPI summary bar (Row 5) - spans 7 columns
    kpi_fill = PatternFill(start_color='E6F0EA', end_color='E6F0EA', fill_type='solid')
    kpi_border = Border(
        left=Side(style='thin', color='C8D9CF'),
        right=Side(style='thin', color='C8D9CF'),
        top=Side(style='thin', color='C8D9CF'),
        bottom=Side(style='thin', color='C8D9CF'),
    )
    ws.merge_cells('A5:B5')
    ws['A5'] = f"TOTAL CLASSES: {len(rows)}"
    ws.merge_cells('C5:D5')
    ws['C5'] = f"FACULTY ASSIGNED: {len(unique_profs)}"
    ws.merge_cells('E5:G5')
    ws['E5'] = f"TERM: {term_label or 'Active Term'}"

    for col in range(1, 8):
        c = ws.cell(row=5, column=col)
        c.fill = kpi_fill
        c.border = kpi_border
        c.font = Font(name='Segoe UI', size=9.5, bold=True, color='05301F')
        c.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[5].height = 24

    ws.row_dimensions[6].height = 8

    # Table Header (Row 7)
    headers = ["Professor", "Subject Code", "Subject Name", "Section", "Day", "Start Time", "End Time"]
    header_fill = PatternFill(start_color='05301F', end_color='05301F', fill_type='solid')
    header_font = Font(name='Segoe UI', size=10, bold=True, color='FFFFFF')
    header_border = Border(
        bottom=Side(style='medium', color='C8A227'),
        left=Side(style='thin', color='084A2A'),
        right=Side(style='thin', color='084A2A'),
    )
    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(row=7, column=col_idx, value=h)
        c.fill = header_fill
        c.font = header_font
        c.border = header_border
        c.alignment = Alignment(horizontal='center' if col_idx not in (1, 3) else 'left', vertical='center')
    ws.row_dimensions[7].height = 26

    # Table Rows (Row 8+)
    row_alt_fill = PatternFill(start_color='F4F8F5', end_color='F4F8F5', fill_type='solid')
    cell_border = Border(
        left=Side(style='thin', color='D5DFD9'),
        right=Side(style='thin', color='D5DFD9'),
        top=Side(style='thin', color='D5DFD9'),
        bottom=Side(style='thin', color='D5DFD9'),
    )

    data_keys = ["professor", "code", "name", "section", "day", "start", "end"]
    for row_idx, r in enumerate(rows, start=8):
        is_alt = (row_idx % 2 == 1)
        ws.row_dimensions[row_idx].height = 21
        for col_idx, key in enumerate(data_keys, start=1):
            val = r[key]
            c = ws.cell(row=row_idx, column=col_idx, value=val)
            c.border = cell_border
            if is_alt:
                c.fill = row_alt_fill

            # Fonts & alignments
            if key == "professor":
                c.font = Font(name='Segoe UI', size=9.5, bold=True, color='0F172A')
                c.alignment = Alignment(horizontal='left', vertical='center')
            elif key == "code":
                c.font = Font(name='Segoe UI', size=9.5, bold=True, color='05301F')
                c.alignment = Alignment(horizontal='center', vertical='center')
            elif key in ("section", "day", "start", "end"):
                c.font = Font(name='Segoe UI', size=9.5, color='1E293B')
                c.alignment = Alignment(horizontal='center', vertical='center')
            else:
                c.font = Font(name='Segoe UI', size=9.5, color='1E293B')
                c.alignment = Alignment(horizontal='left', vertical='center')

    # Auto-adjust column widths
    min_widths = {1: 24, 2: 15, 3: 38, 4: 12, 5: 12, 6: 14, 7: 14}
    for col_idx in range(1, 8):
        col_letter = get_column_letter(col_idx)
        max_len = min_widths.get(col_idx, 15)
        for row in range(7, len(rows) + 8):
            cell_val = str(ws.cell(row=row, column=col_idx).value or '')
            if len(cell_val) > max_len:
                max_len = len(cell_val)
        ws.column_dimensions[col_letter].width = min(max_len + 3, 50)

    # Freeze header rows
    ws.freeze_panes = 'A8'

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output, len(rows)


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
    required_cols = ['CurriculumCode', 'FacultyEmail', 'Day', 'StartTime', 'EndTime', 'Section']
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

    for index, row in enumerate(rows[1:], start=2):
        if not row or all(v is None for v in row):
            continue
        try:
            curr_code = str(row[col_indices['CurriculumCode']]).strip() if row[col_indices['CurriculumCode']] is not None else ""
            fac_email = str(row[col_indices['FacultyEmail']]).strip() if row[col_indices['FacultyEmail']] is not None else ""
            day_val = str(row[col_indices['Day']]).strip() if row[col_indices['Day']] is not None else ""
            start_val = row[col_indices['StartTime']]
            end_val = row[col_indices['EndTime']]
            sec_val = str(row[col_indices['Section']]).strip() if row[col_indices['Section']] is not None else ""

            curriculum_item = curriculum_by_code.get(curr_code)
            faculty = faculty_by_email.get(fac_email)
            
            if not curriculum_item or not faculty:
                errors.append(f"Row {index}: Entity not found (Curriculum: {curriculum_item is not None}, Faculty: {faculty is not None})")
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
                room_id=None,
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
