/**
 * Faculty identity colours — Uxintace Palette Design System
 * (#0F2A1D, #375534, #6B9071, #AEC3B0, #E3EED4).
 */
export const FACULTY_COLOR_PALETTES = [
  {
    name: 'deep-pine',
    accent: '#0F2A1D',
    bg: '#EAF0EB',
    border: 'rgba(15, 42, 29, 0.22)',
    title: '#0F2A1D',
    time: '#2B4D39',
    meta: '#446450',
    dot: 'bg-[#0F2A1D]',
    badgeBg: '#DCE8DE',
    badgeText: '#0F2A1D',
    text: 'text-[#0F2A1D]',
  },
  {
    name: 'hunter-green',
    accent: '#375534',
    bg: '#E7EFE5',
    border: 'rgba(55, 85, 52, 0.22)',
    title: '#1B3618',
    time: '#375534',
    meta: '#4D6B4A',
    dot: 'bg-[#375534]',
    badgeBg: '#D9E8D6',
    badgeText: '#1B3618',
    text: 'text-[#1B3618]',
  },
  {
    name: 'sage-green',
    accent: '#6B9071',
    bg: '#EFF5EE',
    border: 'rgba(107, 144, 113, 0.25)',
    title: '#1D3B24',
    time: '#4F7556',
    meta: '#5A8062',
    dot: 'bg-[#6B9071]',
    badgeBg: '#E0EDE0',
    badgeText: '#1D3B24',
    text: 'text-[#1D3B24]',
  },
  {
    name: 'soft-pistachio',
    accent: '#476949',
    bg: '#E3EED4',
    border: 'rgba(71, 105, 73, 0.22)',
    title: '#1A331C',
    time: '#375534',
    meta: '#4E6C4F',
    dot: 'bg-[#476949]',
    badgeBg: '#D5E4C3',
    badgeText: '#1A331C',
    text: 'text-[#1A331C]',
  },
  {
    name: 'light-celadon',
    accent: '#527A5F',
    bg: '#E8F2EC',
    border: 'rgba(82, 122, 95, 0.22)',
    title: '#133521',
    time: '#3D654D',
    meta: '#4F775F',
    dot: 'bg-[#527A5F]',
    badgeBg: '#DAEAE0',
    badgeText: '#133521',
    text: 'text-[#133521]',
  },
  {
    name: 'olive-moss',
    accent: '#4A5E33',
    bg: '#EFF3E8',
    border: 'rgba(74, 94, 51, 0.22)',
    title: '#1E2C11',
    time: '#4A5E33',
    meta: '#5E7245',
    dot: 'bg-[#4A5E33]',
    badgeBg: '#E2EAC7',
    badgeText: '#1E2C11',
    text: 'text-[#1E2C11]',
  },
  {
    name: 'dark-spruce',
    accent: '#1F4332',
    bg: '#E5ECE7',
    border: 'rgba(31, 67, 50, 0.22)',
    title: '#0E271C',
    time: '#2B5541',
    meta: '#426B57',
    dot: 'bg-[#1F4332]',
    badgeBg: '#D4E2D8',
    badgeText: '#0E271C',
    text: 'text-[#0E271C]',
  },
  {
    name: 'eucalyptus',
    accent: '#3E6652',
    bg: '#E9F2ED',
    border: 'rgba(62, 102, 82, 0.22)',
    title: '#163828',
    time: '#3E6652',
    meta: '#527A66',
    dot: 'bg-[#3E6652]',
    badgeBg: '#DAE9E0',
    badgeText: '#163828',
    text: 'text-[#163828]',
  },
];

export const getFacultyColor = (profName) => {
  if (!profName) return FACULTY_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < profName.length; i++) {
    hash = profName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FACULTY_COLOR_PALETTES.length;
  return FACULTY_COLOR_PALETTES[index];
};

export const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DAY_LABEL = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

export const YEAR_LEVEL_LABEL = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
  5: '5th Year',
  6: '6th Year',
};

/**
 * Normalize semester term values ('1st', '2nd', '3rd semester', 'Summer', etc.)
 * into canonical keys ('1st' | '2nd' | '3rd' | '') matching backend logic.
 */
export const normalizeTermKey = (term) => {
  const s = String(term ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('1') || s.includes('first')) return '1st';
  if (s.startsWith('2') || s.includes('second')) return '2nd';
  if (s.startsWith('3') || s.includes('third') || s.includes('summer')) return '3rd';
  return s;
};

/**
 * Filter curriculum subjects to PUBLISHED blocks matching the active semester's
 * term, attach program/year grouping metadata and current-term faculty offerings,
 * and sort deterministically by Program -> Year Level -> Subject Code.
 */
export const filterActiveTermSubjects = (
  curriculumList,
  blocksList,
  activeSemester,
  offeringsList = []
) => {
  const curriculum = Array.isArray(curriculumList) ? curriculumList : [];
  const blocks = Array.isArray(blocksList) ? blocksList : [];
  const offerings = Array.isArray(offeringsList) ? offeringsList : [];

  const blockById = new Map();
  const publishedBlockIds = new Set();
  for (const b of blocks) {
    if (!b || b.id == null) continue;
    blockById.set(b.id, b);
    if (String(b.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED') {
      publishedBlockIds.add(b.id);
    }
  }

  const offeringsByCurriculum = new Map();
  for (const off of offerings) {
    if (!off || off.curriculum_id == null) continue;
    const key = Number(off.curriculum_id);
    if (!offeringsByCurriculum.has(key)) offeringsByCurriculum.set(key, []);
    offeringsByCurriculum.get(key).push({
      id: off.id,
      faculty_id: off.faculty_id,
      faculty_name: off.faculty_name || '',
    });
  }

  const hasBlocks = blockById.size > 0;
  const activeTermKey = normalizeTermKey(activeSemester?.term);

  return curriculum
    .filter((s) => {
      if (!s) return false;
      if (hasBlocks && !publishedBlockIds.has(s.block_id)) return false;
      if (activeTermKey && normalizeTermKey(s.semester_term) !== activeTermKey) return false;
      return true;
    })
    .map((s) => {
      const block = blockById.get(s.block_id);
      const programName = block?.program_name || s.program_code || 'Curriculum';
      const yearNum = Number.parseInt(String(s.year_level || '').trim(), 10);
      const yearLabel = YEAR_LEVEL_LABEL[yearNum] || (s.year_level ? `Year ${s.year_level}` : 'General');
      return {
        ...s,
        program_name: programName,
        year_label: yearLabel,
        year_sort: Number.isNaN(yearNum) ? 99 : yearNum,
        group_label: `${programName} · ${yearLabel}`,
        assigned_offerings: offeringsByCurriculum.get(Number(s.id)) || [],
      };
    })
    .sort(
      (a, b) =>
        String(a.program_name).localeCompare(String(b.program_name)) ||
        a.year_sort - b.year_sort ||
        String(a.code || '').localeCompare(String(b.code || ''))
    );
};

/**
 * Standard Academic Periods for the Structured Timetable Matrix.
 * Covers 7:30 AM to 7:30 PM with clean institutional slot thresholds.
 */
export const ACADEMIC_PERIODS = [
  { id: 'p1', num: '1', title: 'Period 1', time: '07:30 – 09:00', thresholdStart: 0, thresholdEnd: 540 },
  { id: 'p2', num: '2', title: 'Period 2', time: '09:00 – 10:30', thresholdStart: 540, thresholdEnd: 630 },
  { id: 'p3', num: '3', title: 'Period 3', time: '10:30 – 12:00', thresholdStart: 630, thresholdEnd: 720 },
  { id: 'p4', num: '4', title: 'Period 4', time: '12:00 – 01:00', thresholdStart: 720, thresholdEnd: 780 },
  { id: 'p5', num: '5', title: 'Period 5', time: '01:00 – 02:30', thresholdStart: 780, thresholdEnd: 870 },
  { id: 'p6', num: '6', title: 'Period 6', time: '02:30 – 04:00', thresholdStart: 870, thresholdEnd: 960 },
  { id: 'p7', num: '7', title: 'Period 7', time: '04:00 – 05:30', thresholdStart: 960, thresholdEnd: 1050 },
  { id: 'p8', num: '8', title: 'Period 8', time: '05:30 – 07:30', thresholdStart: 1050, thresholdEnd: 1440 },
];

/** "13:30" -> "1:30 PM". */
export const to12h = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hr = parseInt(h, 10);
  if (Number.isNaN(hr)) return '';
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
};

export const minutesOf = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const durationMinutes = (s) => {
  if (!s) return 0;
  const sMin = minutesOf(s.start_time || s.startTime);
  const eMin = minutesOf(s.end_time || s.endTime);
  return Math.max(0, eMin - sMin);
};

export const durationHours = (s) => durationMinutes(s) / 60;

/** The API writes either "Mon" or "Monday" depending on the path that saved it. */
export const dayKey = (value) => {
  const head = String(value || '').slice(0, 3).toLowerCase();
  return DAY_ORDER.find((d) => d.toLowerCase() === head) || '';
};

export const formatSubjectCode = (sched) => {
  if (!sched || !sched.subject_code) return '';
  const rawCode = sched.subject_code;
  const abMatch = rawCode.match(/^(.*?)[_\-\s]*A\/B$/i);
  if (abMatch) {
    const baseCode = abMatch[1].trim();
    const isLec = sched.part_type === 'lecture';
    return isLec ? `${baseCode}A` : `${baseCode}B`;
  }
  return rawCode;
};

export const isLabSession = (sched) => {
  if (!sched) return false;
  if (sched.part_type === 'lab') return true;
  if (sched.curriculum_type === 'lab' || sched.curriculum?.type === 'lab') return true;
  const rawCode = sched.subject_code || sched.code || sched.curriculum?.code || '';
  if (rawCode.toUpperCase().endsWith('B')) return true;
  const dur = durationHours(sched);
  if (dur >= 2.0 && sched.curriculum?.lab_units > 0) return true;
  return false;
};

/**
 * The exported file's columns, in order.
 * One list drives both the preview table and the file itself, so the preview
 * cannot drift from what is actually written.
 */
export const EXPORT_COLUMNS = [
  { key: 'faculty', label: 'Professor', value: (s) => s.faculty_name || 'TBA' },
  { key: 'code', label: 'Subject Code', value: (s) => formatSubjectCode(s) },
  { key: 'name', label: 'Subject Name', value: (s) => s.subject_name || '' },
  { key: 'room', label: 'Room', value: (s) => s.room_name || s.room?.name || '' },
  { key: 'day', label: 'Day', value: (s) => DAY_LABEL[dayKey(s.day_of_week)] || s.day_of_week || '' },
  { key: 'start', label: 'Start Time', value: (s) => to12h(s.start_time) },
  { key: 'end', label: 'End Time', value: (s) => to12h(s.end_time) },
  { key: 'hours', label: 'Hours', value: (s) => `${durationHours(s).toFixed(2)}h` },
  {
    key: 'mode',
    label: 'Class Mode',
    value: (s) =>
      s.is_ct || (s.ct_tier && s.ct_tier !== 'regular')
        ? `CT · ${s.ct_tier === 'ct_9_12' ? '9–12' : s.ct_tier === 'ct_5_8' ? '5–8' : s.ct_tier === 'ct_1_4' ? '1–4' : 'CT'}`
        : 'Regular',
  },
];

/** Professor, then the week in order, then time of day. */
export const sortForExport = (rows) =>
  [...rows].sort(
    (a, b) =>
      String(a.faculty_name || '').localeCompare(String(b.faculty_name || '')) ||
      DAY_ORDER.indexOf(dayKey(a.day_of_week)) - DAY_ORDER.indexOf(dayKey(b.day_of_week)) ||
      minutesOf(a.start_time) - minutesOf(b.start_time) ||
      String(a.subject_code || '').localeCompare(String(b.subject_code || ''))
  );

