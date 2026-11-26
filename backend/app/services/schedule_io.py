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
from . import faculty_load


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


_DAY_ORDER = {d: i for i, d in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])}
_EXPORT_HEADERS = ["Professor", "Subject Code", "Subject Name", "Class Mode", "Room", "Day", "Start Time", "End Time", "Hours"]

_REGISTRAR_SINGLE_DAY = {
    'Mon': 'M',
    'Tue': 'TUES',
    'Wed': 'W',
    'Thu': 'THURS',
    'Fri': 'F',
    'Sat': 'SAT',
}

_REGISTRAR_PAIR_DAYS = {
    ('Mon', 'Wed'): 'MW',
    ('Tue', 'Thu'): 'TTH',
    ('Fri', 'Sat'): 'FS',
    ('Mon', 'Wed', 'Fri'): 'MWF',
}


def _format_year_heading(year_val: Any) -> str:
    raw = str(year_val or "").strip()
    if not raw:
        return "GENERAL"
    low = raw.lower()
    if low in ("1", "1st", "1st year", "first year"):
        return "1ST YEAR"
    if low in ("2", "2nd", "2nd year", "second year"):
        return "2ND YEAR"
    if low in ("3", "3rd", "3rd year", "third year"):
        return "3RD YEAR"
    if low in ("4", "4th", "4th year", "fourth year"):
        return "4TH YEAR"
    return raw.upper() if "year" in low else f"{raw.upper()} YEAR"


def _year_sort_key(year_heading: str) -> tuple:
    order = {"1ST YEAR": 1, "2ND YEAR": 2, "3RD YEAR": 3, "4TH YEAR": 4}
    return (order.get(year_heading, 9), year_heading)


def _format_registrar_schedule(sched_list: List[Any]) -> str:
    """
    Format one subject's weekly meetings into the university Registrar syntax:
    e.g. 'MW 0730 - 0930', 'TTH 0930 - 1130', 'THURS 0730 - 1130'.
    """
    if not sched_list:
        return ""
    by_time: dict = {}
    for s in sched_list:
        if not s.start_time or not s.end_time:
            continue
        tkey = (s.start_time.strftime('%H%M'), s.end_time.strftime('%H%M'))
        day = str(s.day_of_week or "")[:3].capitalize()
        by_time.setdefault(tkey, []).append(day)

    parts = []
    for (s_str, e_str), days in by_time.items():
        uniq_days = sorted(set(days), key=lambda d: _DAY_ORDER.get(d, 9))
        key = tuple(uniq_days)
        if key in _REGISTRAR_PAIR_DAYS:
            day_label = _REGISTRAR_PAIR_DAYS[key]
        elif len(uniq_days) == 1:
            day_label = _REGISTRAR_SINGLE_DAY.get(uniq_days[0], uniq_days[0].upper())
        else:
            day_label = "".join(_REGISTRAR_SINGLE_DAY.get(d, d[:1].upper()) for d in uniq_days)
        parts.append(f"{day_label} {s_str} - {e_str}")
    return " / ".join(parts)


def _format_registrar_faculty(faculty: Any) -> str:
    if not faculty:
        return ""
    last = str(getattr(faculty, "last_name", "") or "").strip().upper()
    first = str(getattr(faculty, "first_name", "") or "").strip().upper()
    if last and first:
        return f"{last}, {first}"
    return last or first


def _prepare_export_rows(
    schedules: List[Any], faculty_name: Optional[str] = None
) -> Tuple[List[dict], set]:
    """Flatten, filter, and sort schedule records for PDF/Excel export (CT-aware)."""
    # Count meetings per (faculty_id, curriculum_id) so CT credited weekly hours split cleanly across rows
    meeting_counts: dict = {}
    for s in schedules:
        k = (getattr(s, "faculty_id", None), getattr(s, "curriculum_id", None))
        meeting_counts[k] = meeting_counts.get(k, 0) + 1

    rows = []
    unique_profs = set()
    for s in schedules:
        curriculum_item = s.curriculum
        faculty = s.faculty
        room = getattr(s, "room", None)
        is_lec_only = (
            curriculum_item is not None
            and not faculty_load.is_lab_b_subject(curriculum_item)
            and not faculty_load.is_combined_c_subject(curriculum_item)
        )
        raw_room = (room.name if (room and getattr(room, "name", None)) else "")
        room_label = "" if is_lec_only else raw_room
        prof = f"{faculty.first_name} {faculty.last_name}" if faculty else ""
        if faculty_name and prof != faculty_name:
            continue
        if faculty:
            unique_profs.add(prof)

        enrolled = getattr(s, "enrolled_students", None)
        ct_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled)
        is_ct = ct_tier != faculty_load.CT_TIER_REGULAR
        mode_label = faculty_load.ct_tier_short_label(ct_tier=ct_tier) if is_ct else "Regular"

        if is_ct and curriculum_item is not None:
            k = (getattr(s, "faculty_id", None), getattr(s, "curriculum_id", None))
            cnt = max(1, meeting_counts.get(k, 1))
            ct_total_hrs = faculty_load.subject_required_hours(curriculum_item, ct_tier=ct_tier)
            dur_hrs = faculty_load.round_hours(ct_total_hrs / cnt)
        else:
            dur_hrs = (
                faculty_load.round_hours(faculty_load.duration_hours(s.start_time, s.end_time, s.day_of_week))
                if (s.start_time and s.end_time)
                else 0.0
            )
        rows.append({
            "professor": prof or "Unassigned",
            "code": curriculum_item.code if curriculum_item else "N/A",
            "name": curriculum_item.name if curriculum_item else "N/A",
            "mode": mode_label,
            "is_ct": is_ct,
            "section": s.section or "—",
            "room": room_label,
            "day": str(s.day_of_week or "—"),
            "start": s.start_time.strftime('%I:%M %p').lstrip('0') if s.start_time else "—",
            "end": s.end_time.strftime('%I:%M %p').lstrip('0') if s.end_time else "—",
            "hours": f"{dur_hrs:.2f}",
            "start_time_obj": s.start_time,
            "end_time_obj": s.end_time,
            "_sort": (
                prof,
                _DAY_ORDER.get(str(s.day_of_week or "")[:3], 9),
                s.start_time.strftime('%H:%M') if s.start_time else "",
            ),
        })
    rows.sort(key=lambda r: r["_sort"])
    return rows, unique_profs


def _cell_text(value: Any) -> str:
    """Escape cell values safely for ReportLab Paragraph XML."""
    return xml_escape(str(value if value is not None else ''))


def _build_pdf_styles() -> dict:
    """Create institutional ParagraphStyle presets for schedule PDF export."""
    styles = getSampleStyleSheet()
    base = styles['Normal']
    return {
        "normal": base,
        "title": ParagraphStyle('DocTitle', parent=base, fontName='Helvetica-Bold', fontSize=15, leading=18, textColor=colors.HexColor('#05301F')),
        "inst": ParagraphStyle('DocInst', parent=base, fontName='Helvetica-Bold', fontSize=8.5, leading=11, textColor=colors.HexColor('#C8A227')),
        "sub": ParagraphStyle('DocSub', parent=base, fontName='Helvetica', fontSize=8, leading=10, textColor=colors.HexColor('#475569')),
        "meta": ParagraphStyle('MetaVal', parent=base, fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#1E293B')),
        "cell": ParagraphStyle('CellNorm', parent=base, fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#0F172A')),
        "cell_bold": ParagraphStyle('CellBold', parent=base, fontName='Helvetica-Bold', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#05301F')),
        "center": ParagraphStyle('CellCenter', parent=base, fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#0F172A'), alignment=1),
        "center_bold": ParagraphStyle('CellCenterBold', parent=base, fontName='Helvetica-Bold', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#05301F'), alignment=1),
    }


def _build_pdf_signature_block(meta_style: ParagraphStyle) -> KeepTogether:
    """Build the two-column certification sign-off block appended to timetable PDFs."""
    sig_1 = Paragraph(
        "<b>Certified Correct:</b><br/><br/><br/><br/>"
        "_____________________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br/>"
        "<b>Program Chair</b><br/>"
        "Date: ________________________",
        meta_style,
    )
    sig_2 = Paragraph(
        "<b>Approved by:</b><br/><br/><br/><br/>"
        "_____________________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br/>"
        "<b>Dean / Vice Chancellor for Academic Affairs</b><br/>"
        "Date: ________________________",
        meta_style,
    )
    sig_table = Table([[sig_1, sig_2]], colWidths=[366, 366])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 16),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return KeepTogether(sig_table)


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
    rows, _unique_profs = _prepare_export_rows(schedules, faculty_name)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(letter),
        leftMargin=30, rightMargin=30, topMargin=36, bottomMargin=36,
    )
    pdf_styles = _build_pdf_styles()
    scope_line = faculty_name if faculty_name else "All Faculty Members"

    elements: list[Any] = [
        Paragraph("DE LA SALLE ARANETA UNIVERSITY", pdf_styles["inst"]),
        Paragraph("OFFICIAL CLASS TIMETABLE &amp; FACULTY LOAD", pdf_styles["title"]),
        Paragraph("Automated Timetable &amp; Load Allocation System (ATLAS)", pdf_styles["sub"]),
        Spacer(1, 6),
    ]

    meta_data = [[
        Paragraph(f"<b>Department:</b> {_cell_text(dept_name)}", pdf_styles["meta"]),
        Paragraph(f"<b>Academic Term:</b> {_cell_text(term_label or 'Active Term')}", pdf_styles["meta"]),
        Paragraph(f"<b>Faculty Scope:</b> {_cell_text(scope_line)}", pdf_styles["meta"]),
        Paragraph(f"<b>Total Classes:</b> {len(rows)} scheduled", pdf_styles["meta"]),
    ]]
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
    elements.extend([meta_table, Spacer(1, 8)])

    if not rows:
        elements.append(Paragraph("No classes are scheduled for this selection.", pdf_styles["normal"]))
    else:
        data: list[Any] = [_EXPORT_HEADERS]
        for r in rows:
            data.append([
                Paragraph(_cell_text(r["professor"]), pdf_styles["cell_bold"]),
                Paragraph(_cell_text(r["code"]), pdf_styles["center_bold"]),
                Paragraph(_cell_text(r["name"]), pdf_styles["cell"]),
                Paragraph(_cell_text(r["mode"]), pdf_styles["center"]),
                Paragraph(_cell_text(r["room"]), pdf_styles["center"]),
                Paragraph(_cell_text(r["day"]), pdf_styles["center_bold"]),
                Paragraph(_cell_text(r["start"]), pdf_styles["center"]),
                Paragraph(_cell_text(r["end"]), pdf_styles["center"]),
                Paragraph(_cell_text(r["hours"]), pdf_styles["center"]),
            ])

        table = Table(data, repeatRows=1, colWidths=[118, 68, 178, 58, 52, 48, 70, 70, 70])
        table.setStyle(TableStyle([
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
        elements.extend([table, Spacer(1, 6), _build_pdf_signature_block(pdf_styles["meta"])])

    doc.build(elements, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer, len(rows)


def _write_excel_banner_and_kpi(
    ws: Any, dept_name: str, term_label: str, faculty_name: Optional[str],
    row_count: int, prof_count: int,
) -> None:
    """Write the institutional banner (rows 1-3) and KPI strip (row 5) to an Excel sheet."""
    scope_line = faculty_name if faculty_name else "All Faculty Members"
    now_str = datetime.now().strftime('%B %d, %Y %I:%M %p')
    banner_rows = [
        ('DE LA SALLE ARANETA UNIVERSITY', 11, True, 'C8A227', 22),
        ('OFFICIAL CLASS TIMETABLE & FACULTY LOAD', 16, True, 'FFFFFF', 28),
        (f"{dept_name}   ·   {term_label or 'Active Term'}   ·   {scope_line}   ·   Generated {now_str}", 9.5, False, 'D0DFD6', 20),
    ]
    gold_border = Border(bottom=Side(style='medium', color='C8A227'))
    banner_fill = PatternFill(start_color='05301F', end_color='05301F', fill_type='solid')
    for r, (txt, sz, bold, color, h) in enumerate(banner_rows, start=1):
        top_cell = ws.cell(row=r, column=1, value=txt)
        top_cell.font = Font(name='Segoe UI', size=sz, bold=bold, color=color)
        top_cell.fill = banner_fill
        top_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=7)
        ws.row_dimensions[r].height = h
        if r == 3:
            for col in range(1, 8):
                ws.cell(row=r, column=col).border = gold_border

    ws.row_dimensions[4].height = 8
    kpi_fill = PatternFill(start_color='E6F0EA', end_color='E6F0EA', fill_type='solid')
    thin_side = Side(style='thin', color='C8D9CF')
    kpi_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    ws.merge_cells('A5:B5')
    ws['A5'] = f"TOTAL CLASSES: {row_count}"
    ws.merge_cells('C5:D5')
    ws['C5'] = f"FACULTY ASSIGNED: {prof_count}"
    ws.merge_cells('E5:G5')
    ws['E5'] = f"TERM: {term_label or 'Active Term'}"

    for col in range(1, 8):
        cell = ws.cell(row=5, column=col)
        cell.fill = kpi_fill
        cell.border = kpi_border
        cell.font = Font(name='Segoe UI', size=9.5, bold=True, color='05301F')
        cell.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[5].height = 24
    ws.row_dimensions[6].height = 8


def _write_registrar_proposal_sheet(
    ws: Any,
    schedules: List[Any],
    proposal_subjects: Optional[List[dict]] = None,
    faculty_name: Optional[str] = None,
) -> None:
    """
    Write Sheet 1 ('Registrar Proposal') matching the university Registrar Excel template:
    Grouped by Program & Year Level (e.g., 'BSCOE 1ST YEAR', 'BSCOE 2ND YEAR', ...)
    with columns: Subject | SubjDesc | RUnits | Schedule | Faculty | Room | Class Mode
    and bold red unit totals under each year-level block.
    """
    ws.views.sheetView[0].showGridLines = True

    # Group schedules by curriculum_id (respecting optional faculty_name filter)
    scheds_by_curr: dict = {}
    for s in schedules:
        fac = getattr(s, "faculty", None)
        prof_full = f"{fac.first_name} {fac.last_name}".strip() if fac else ""
        if faculty_name and prof_full != faculty_name:
            continue
        cid = getattr(s, "curriculum_id", None)
        if cid is not None:
            scheds_by_curr.setdefault(cid, []).append(s)

    # Build grouped entries: { (program_code, year_heading): [row_dict, ...] }
    groups: dict = {}
    seen_curr_ids: set = set()

    if proposal_subjects:
        for item in proposal_subjects:
            cid = item["curriculum_id"]
            seen_curr_ids.add(cid)
            s_list = scheds_by_curr.get(cid, [])
            if faculty_name and not s_list:
                continue
            prog_label = str(item.get("program_code") or item.get("program_name") or "PROGRAM").strip().upper()
            year_label = _format_year_heading(item.get("year_level"))
            curr = item.get("curriculum")
            fac = (s_list[0].faculty if s_list and getattr(s_list[0], "faculty", None) else item.get("faculty"))
            is_lec_only = (
                curr is not None
                and not faculty_load.is_lab_b_subject(curr)
                and not faculty_load.is_combined_c_subject(curr)
            )
            room_val = ""
            if not is_lec_only:
                for sc in s_list:
                    rm = getattr(sc, "room", None)
                    if rm and getattr(rm, "name", None):
                        room_val = str(rm.name).strip()
                        break

            enrolled = item.get("enrolled_students")
            if enrolled is None and s_list:
                enrolled = getattr(s_list[0], "enrolled_students", None)
            ct_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled)
            is_ct = ct_tier != faculty_load.CT_TIER_REGULAR
            mode_val = ""
            if is_ct and curr is not None:
                ct_hrs = faculty_load.subject_required_hours(curr, ct_tier=ct_tier)
                mode_val = f"{faculty_load.ct_tier_short_label(ct_tier=ct_tier)} ({ct_hrs:g}h)"

            groups.setdefault((prog_label, year_label), []).append({
                "code": str(item.get("code") or "").strip().upper(),
                "desc": str(item.get("name") or "").strip().upper(),
                "units": int(item.get("units") or 0),
                "schedule": _format_registrar_schedule(s_list),
                "faculty": _format_registrar_faculty(fac),
                "room": room_val,
                "mode": mode_val,
            })

    # Include any plotted schedules whose curriculum was not in proposal_subjects
    for cid, s_list in scheds_by_curr.items():
        if cid in seen_curr_ids or not s_list:
            continue
        curr = getattr(s_list[0], "curriculum", None)
        fac = getattr(s_list[0], "faculty", None)
        prog_label = str(faculty_load.curriculum_program_code(curr) or "PROGRAM").strip().upper() if curr else "PROGRAM"
        year_label = _format_year_heading(getattr(curr, "year_level", "")) if curr else "GENERAL"
        is_lec_only = (
            curr is not None
            and not faculty_load.is_lab_b_subject(curr)
            and not faculty_load.is_combined_c_subject(curr)
        )
        room_val = ""
        if not is_lec_only:
            for sc in s_list:
                rm = getattr(sc, "room", None)
                if rm and getattr(rm, "name", None):
                    room_val = str(rm.name).strip()
                    break
        enrolled = getattr(s_list[0], "enrolled_students", None)
        ct_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled)
        is_ct = ct_tier != faculty_load.CT_TIER_REGULAR
        mode_val = ""
        if is_ct and curr is not None:
            ct_hrs = faculty_load.subject_required_hours(curr, ct_tier=ct_tier)
            mode_val = f"{faculty_load.ct_tier_short_label(ct_tier=ct_tier)} ({ct_hrs:g}h)"

        groups.setdefault((prog_label, year_label), []).append({
            "code": str(getattr(curr, "code", "") or "").strip().upper(),
            "desc": str(getattr(curr, "name", "") or "").strip().upper(),
            "units": int(getattr(curr, "units", 0) or 0),
            "schedule": _format_registrar_schedule(s_list),
            "faculty": _format_registrar_faculty(fac),
            "room": room_val,
            "mode": mode_val,
        })

    thin_black = Side(style='thin', color='1E293B')
    cell_border = Border(left=thin_black, right=thin_black, top=thin_black, bottom=thin_black)
    hdr_fill = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')
    ct_fill = PatternFill(start_color='E6F4F1', end_color='E6F4F1', fill_type='solid')
    title_font = Font(name='Arial', size=10.5, bold=True, color='000000')
    hdr_font = Font(name='Arial', size=9.5, bold=True, color='000000')
    body_font = Font(name='Arial', size=9.5, color='000000')
    total_font = Font(name='Arial', size=10, bold=True, color='C00000')

    col_headers = ["Subject", "SubjDesc", "RUnits", "Schedule", "Faculty", "Room", "Class Mode"]
    sorted_keys = sorted(groups.keys(), key=lambda kv: (kv[0], _year_sort_key(kv[1])))

    row_cursor = 1
    if not sorted_keys:
        ws.cell(row=1, column=1, value="No scheduled offerings found for this selection.").font = body_font
    else:
        for prog_label, year_label in sorted_keys:
            items = sorted(groups[(prog_label, year_label)], key=lambda x: x["code"])
            # Section Title Row (e.g., BSCOE 1ST YEAR)
            ws.merge_cells(start_row=row_cursor, start_column=1, end_row=row_cursor, end_column=7)
            tcell = ws.cell(row=row_cursor, column=1, value=f"{prog_label} {year_label}".strip())
            tcell.font = title_font
            tcell.alignment = Alignment(horizontal='center', vertical='center')
            ws.row_dimensions[row_cursor].height = 20
            row_cursor += 1

            # Column Headers Row
            for c_idx, h in enumerate(col_headers, start=1):
                hc = ws.cell(row=row_cursor, column=c_idx, value=h)
                hc.fill = hdr_fill
                hc.font = hdr_font
                hc.border = cell_border
                hc.alignment = Alignment(horizontal='center' if c_idx not in (1, 2) else 'left', vertical='center')
            ws.row_dimensions[row_cursor].height = 19
            row_cursor += 1

            total_units = 0
            for item in items:
                total_units += item["units"]
                vals = [
                    item["code"],
                    item["desc"],
                    item["units"],
                    item["schedule"],
                    item["faculty"],
                    item["room"],
                    item["mode"],
                ]
                for c_idx, val in enumerate(vals, start=1):
                    c = ws.cell(row=row_cursor, column=c_idx, value=val)
                    c.font = body_font
                    c.border = cell_border
                    if item["mode"] and c_idx == 7:
                        c.fill = ct_fill
                        c.font = Font(name='Arial', size=9, bold=True, color='0F766E')
                    horiz = 'left' if c_idx in (1, 2) else 'center'
                    c.alignment = Alignment(horizontal=horiz, vertical='center')
                ws.row_dimensions[row_cursor].height = 18
                row_cursor += 1

            # Total Units Row (matches red bold total in sample sheet)
            for c_idx in range(1, 8):
                c = ws.cell(row=row_cursor, column=c_idx, value=total_units if c_idx == 3 else "")
                c.border = cell_border
                if c_idx == 3:
                    c.font = total_font
                    c.alignment = Alignment(horizontal='center', vertical='center')
            ws.row_dimensions[row_cursor].height = 19
            row_cursor += 2  # Blank spacer row before next year block

    col_widths = {1: 14, 2: 52, 3: 9, 4: 22, 5: 24, 6: 12, 7: 18}
    for col_idx, width in col_widths.items():
        ws.column_dimensions[get_column_letter(col_idx)].width = width


def build_schedule_excel(
    schedules: List[Any],
    dept_name: str = "All Departments",
    term_label: str = "",
    faculty_name: Optional[str] = None,
    proposal_subjects: Optional[List[dict]] = None,
) -> Tuple[io.BytesIO, int]:
    """
    Export schedules to an Excel workbook buffer styled with institutional branding.
    Sheet 1: Registrar Proposal (grouped by Program & Year Level matching university template)
    Sheet 2: Class Timetable (flat professor schedule with CT credited hours)
    Sheet 3: Weekly Timetable Grid (Mon-Sat visual grid with Lunch Break)
    Returns (buffer, row_count).
    """
    rows, unique_profs = _prepare_export_rows(schedules, faculty_name)

    wb = openpyxl.Workbook()
    prop_ws = wb.active or wb.create_sheet("Registrar Proposal")
    prop_ws.title = "Registrar Proposal"
    _write_registrar_proposal_sheet(prop_ws, schedules, proposal_subjects=proposal_subjects, faculty_name=faculty_name)

    ws = wb.create_sheet("Class Timetable")
    ws.views.sheetView[0].showGridLines = True

    _write_excel_banner_and_kpi(ws, dept_name, term_label, faculty_name, len(rows), len(unique_profs))

    header_fill = PatternFill(start_color='05301F', end_color='05301F', fill_type='solid')
    header_font = Font(name='Segoe UI', size=10, bold=True, color='FFFFFF')
    header_border = Border(
        bottom=Side(style='medium', color='C8A227'),
        left=Side(style='thin', color='084A2A'),
        right=Side(style='thin', color='084A2A'),
    )
    for col_idx, h in enumerate(_EXPORT_HEADERS, start=1):
        c = ws.cell(row=7, column=col_idx, value=h)
        c.fill = header_fill
        c.font = header_font
        c.border = header_border
        c.alignment = Alignment(horizontal='center' if col_idx not in (1, 3) else 'left', vertical='center')
    ws.row_dimensions[7].height = 26

    row_alt_fill = PatternFill(start_color='F4F8F5', end_color='F4F8F5', fill_type='solid')
    grid_side = Side(style='thin', color='D5DFD9')
    cell_border = Border(left=grid_side, right=grid_side, top=grid_side, bottom=grid_side)
    key_styles = {
        "professor": (Font(name='Segoe UI', size=9.5, bold=True, color='0F172A'), 'left'),
        "code": (Font(name='Segoe UI', size=9.5, bold=True, color='05301F'), 'center'),
        "name": (Font(name='Segoe UI', size=9.5, color='1E293B'), 'left'),
    }
    default_style = (Font(name='Segoe UI', size=9.5, color='1E293B'), 'center')
    data_keys = ["professor", "code", "name", "mode", "room", "day", "start", "end", "hours"]

    for row_idx, r in enumerate(rows, start=8):
        is_alt = (row_idx % 2 == 1)
        ws.row_dimensions[row_idx].height = 21
        for col_idx, key in enumerate(data_keys, start=1):
            c = ws.cell(row=row_idx, column=col_idx, value=r[key])
            c.border = cell_border
            if is_alt:
                c.fill = row_alt_fill
            font, horiz = key_styles.get(key, default_style)
            c.font = font
            c.alignment = Alignment(horizontal=horiz, vertical='center')

    min_widths = {1: 24, 2: 15, 3: 36, 4: 14, 5: 12, 6: 10, 7: 14, 8: 14, 9: 10}
    for col_idx in range(1, len(_EXPORT_HEADERS) + 1):
        max_len = max(
            [min_widths.get(col_idx, 14)] +
            [len(str(ws.cell(row=row, column=col_idx).value or '')) for row in range(7, len(rows) + 8)]
        )
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 3, 50)

    ws.freeze_panes = 'A8'

    # Second Sheet: Weekly Timetable Grid (Mon-Sat with Mon-Fri 12:00-13:00 LUNCH BREAK)
    grid_ws = wb.create_sheet("Weekly Timetable Grid")
    grid_ws.views.sheetView[0].showGridLines = True
    grid_days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    grid_headers = ["Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    for col_idx, h in enumerate(grid_headers, start=1):
        cell = grid_ws.cell(row=1, column=col_idx, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = header_border
        cell.alignment = Alignment(horizontal='center', vertical='center')
    grid_ws.row_dimensions[1].height = 26

    # Build 30-minute bands from 07:30 to 17:30 (or 19:30 if CVMAS or classes exist after 17:30)
    has_late = any(
        r.get("end_time_obj") and (r["end_time_obj"].hour * 60 + r["end_time_obj"].minute) > 1050
        for r in rows
    )
    max_band_end = 1170 if ("CVMAS" in str(dept_name or "").upper() or has_late) else 1050

    all_time_bands = [
        (450, 480, "07:30 AM - 08:00 AM"),
        (480, 510, "08:00 AM - 08:30 AM"),
        (510, 540, "08:30 AM - 09:00 AM"),
        (540, 570, "09:00 AM - 09:30 AM"),
        (570, 600, "09:30 AM - 10:00 AM"),
        (600, 630, "10:00 AM - 10:30 AM"),
        (630, 660, "10:30 AM - 11:00 AM"),
        (660, 690, "11:00 AM - 11:30 AM"),
        (690, 720, "11:30 AM - 12:00 PM"),
        (720, 750, "12:00 PM - 12:30 PM"),
        (750, 780, "12:30 PM - 01:00 PM"),
        (780, 810, "01:00 PM - 01:30 PM"),
        (810, 840, "01:30 PM - 02:00 PM"),
        (840, 870, "02:00 PM - 02:30 PM"),
        (870, 900, "02:30 PM - 03:00 PM"),
        (900, 930, "03:00 PM - 03:30 PM"),
        (930, 960, "03:30 PM - 04:00 PM"),
        (960, 990, "04:00 PM - 04:30 PM"),
        (990, 1020, "04:30 PM - 05:00 PM"),
        (1020, 1050, "05:00 PM - 05:30 PM"),
        (1050, 1080, "05:30 PM - 06:00 PM"),
        (1080, 1110, "06:00 PM - 06:30 PM"),
        (1110, 1140, "06:30 PM - 07:00 PM"),
        (1140, 1170, "07:00 PM - 07:30 PM"),
    ]
    time_bands = [b for b in all_time_bands if b[1] <= max_band_end]
    lunch_fill = PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')
    lunch_font = Font(name='Segoe UI', size=9, bold=True, color='92400E')
    class_fill = PatternFill(start_color='E6F4EA', end_color='E6F4EA', fill_type='solid')

    for b_idx, (b_start, b_end, label) in enumerate(time_bands, start=2):
        grid_ws.row_dimensions[b_idx].height = 24
        t_cell = grid_ws.cell(row=b_idx, column=1, value=label)
        t_cell.font = Font(name='Segoe UI', size=8.5, bold=True, color='334155')
        t_cell.alignment = Alignment(horizontal='center', vertical='center')
        t_cell.border = cell_border

        for d_idx, day_code in enumerate(grid_days, start=2):
            c = grid_ws.cell(row=b_idx, column=d_idx)
            c.border = cell_border

            matching = []
            for r in rows:
                if r["day"] != day_code or not r["start_time_obj"] or not r["end_time_obj"]:
                    continue
                s_min = r["start_time_obj"].hour * 60 + r["start_time_obj"].minute
                e_min = r["end_time_obj"].hour * 60 + r["end_time_obj"].minute
                if s_min < b_end and e_min > b_start:
                    ct_part = " [CT]" if r.get("is_ct") else ""
                    room_part = f" · {r['room']}" if r.get("room") else ""
                    matching.append(f"{r['code']}{ct_part}{room_part} · {r['start']}-{r['end']}")
            if matching:
                c.value = "\n".join(matching)
                c.fill = class_fill
                c.font = Font(name='Segoe UI', size=8.5, bold=True, color='05301F')
                c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

    grid_ws.column_dimensions['A'].width = 22
    for col_idx in range(2, 8):
        grid_ws.column_dimensions[get_column_letter(col_idx)].width = 28

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output, len(rows)


def _parse_time_val(t_val: Any):
    """Parse an Excel time cell (datetime, time, or formatted string) to a time object."""
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


def import_schedules_from_excel(
    contents: bytes,
    db: Session,
    semester_id: int,
    department_id: Optional[int] = None,
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
    required_cols = ['CurriculumCode', 'FacultyEmail', 'Day', 'StartTime', 'EndTime']
    col_indices = {}
    for col in required_cols:
        if col not in header:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        col_indices[col] = header.index(col)
    sec_col = header.index('Section') if 'Section' in header else -1
            
    success_count = 0
    errors = []
    valid_days = {'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'}

    def _index(rows_, key):
        out = {}
        for r in rows_:
            k = getattr(r, key)
            if k and k not in out:
                out[k] = r
        return out

    curr_q = db.query(models.Curriculum)
    fac_q = db.query(models.Faculty)
    if department_id is not None:
        curr_q = curr_q.filter(models.Curriculum.department_id == department_id)
        fac_q = fac_q.filter(models.Faculty.department_id == department_id)
    curriculum_by_code = _index(curr_q.order_by(models.Curriculum.id).all(), "code")
    faculty_by_email = _index(fac_q.order_by(models.Faculty.id).all(), "email")

    for index, row in enumerate(rows[1:], start=2):
        if not row or all(v is None for v in row):
            continue
        try:
            curr_code = str(row[col_indices['CurriculumCode']]).strip() if row[col_indices['CurriculumCode']] is not None else ""
            fac_email = str(row[col_indices['FacultyEmail']]).strip() if row[col_indices['FacultyEmail']] is not None else ""
            day_val = str(row[col_indices['Day']]).strip() if row[col_indices['Day']] is not None else ""
            start_val = row[col_indices['StartTime']]
            end_val = row[col_indices['EndTime']]
            sec_val = str(row[sec_col]).strip()[:20] if sec_col != -1 and row[sec_col] is not None else ""

            if day_val not in valid_days:
                errors.append(f"Row {index}: Invalid day '{day_val}' (must be Mon–Sat).")
                continue

            curriculum_item = curriculum_by_code.get(curr_code)
            faculty = faculty_by_email.get(fac_email)
            
            if not curriculum_item or not faculty:
                errors.append(f"Row {index}: Entity not found in your college (Curriculum: {curriculum_item is not None}, Faculty: {faculty is not None})")
                continue
                
            start_t = _parse_time_val(start_val)
            end_t = _parse_time_val(end_val)
            if end_t <= start_t:
                errors.append(f"Row {index}: End time must be after start time for {curr_code}.")
                continue
            
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
