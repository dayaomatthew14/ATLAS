import { useMemo, useState, useCallback, memo } from 'react';
import { Lock, Unlock, Trash2, AlertTriangle } from 'lucide-react';
import {
  DAY_ORDER,
  DAY_LABEL,
  getFacultyColor,
  minutesOf,
  to12h,
  formatSubjectCode,
  isLabSession,
} from '../../utils/scheduleHelpers';
import { isCombinedCSubject } from '../../utils/load';
import { getDepartment } from '../../utils/session';

const GRID_START_MIN = 7 * 60 + 30; // 07:30 AM (450)
const GRID_END_MIN_STANDARD = 17 * 60 + 30; // 05:30 PM (1050)
const GRID_END_MIN_EXTENDED = 19 * 60 + 30; // 07:30 PM (1170)

// 1.35px per minute -> 30m = 40.5px, 60m = 81px, 80m = 108px, 120m = 162px, 240m = 324px
const PX_PER_MINUTE = 1.35;
const GRID_PADDING_TOP = 20; // Clear vertical buffer between sticky column header and 07:30 AM line

/** Generate 30-minute time ticks from 07:30 AM up to endMin for the vertical axis. */
function buildTimeTicks(endMin) {
  const ticks = [];
  for (let m = GRID_START_MIN; m <= endMin; m += 30) {
    const h24 = Math.floor(m / 60);
    const mins = m % 60;
    const h12 = h24 % 12 || 12;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const label = `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
    const isHour = mins === 0;
    const isHalf = mins === 30;
    ticks.push({
      minutes: m,
      topPx: (m - GRID_START_MIN) * PX_PER_MINUTE + GRID_PADDING_TOP,
      label,
      isHour,
      isHalf,
    });
  }
  return ticks;
}

const HALF_HOUR_PX = 30 * PX_PER_MINUTE;
const HOUR_PX = 60 * PX_PER_MINUTE;
const GRID_LINES_BACKGROUND = `repeating-linear-gradient(
  to bottom,
  transparent 0px,
  transparent ${HALF_HOUR_PX - 1}px,
  #D5DFD9 ${HALF_HOUR_PX - 1}px,
  #D5DFD9 ${HALF_HOUR_PX}px,
  transparent ${HALF_HOUR_PX}px,
  transparent ${HOUR_PX - 1}px,
  #EEF3EF ${HOUR_PX - 1}px,
  #EEF3EF ${HOUR_PX}px
)`;

// Soft, low-saturation cool/neutral palette (no red, orange, or yellow warning tones) — distinct yet easy on the eyes.
const SOFT_SUBJECT_PALETTE = [
  { bg: '#EFF6F0', border: '#BDD4C2', accent: '#3B6E52', badgeBg: '#DCECE0', badgeText: '#1A402B', title: '#132E1F', time: '#2A553D' }, // Soft Sage
  { bg: '#EFF5FA', border: '#BDD3E6', accent: '#3A6B94', badgeBg: '#DCEAF5', badgeText: '#1C3F5E', title: '#132A40', time: '#2B5478' }, // Soft Sky
  { bg: '#F4F1FA', border: '#CFC4E6', accent: '#685199', badgeBg: '#E6DDF5', badgeText: '#3A2863', title: '#261A42', time: '#513D7D' }, // Soft Lavender
  { bg: '#EDF7F6', border: '#B5DBD7', accent: '#2D756E', badgeBg: '#D6ECE9', badgeText: '#154540', title: '#0E2E2B', time: '#215B55' }, // Soft Teal
  { bg: '#F1F3FA', border: '#C4CBE6', accent: '#4A5D9E', badgeBg: '#DFE4F5', badgeText: '#233163', title: '#172145', time: '#384880' }, // Soft Periwinkle
  { bg: '#EDF6F2', border: '#B7D9CA', accent: '#2E7058', badgeBg: '#D6EBE1', badgeText: '#144232', title: '#0E2D22', time: '#215744' }, // Soft Mint
  { bg: '#F1F5F9', border: '#CBD5E1', accent: '#475569', badgeBg: '#E2E8F0', badgeText: '#1E293B', title: '#0F172A', time: '#334155' }, // Soft Slate Blue
  { bg: '#F0F6FA', border: '#BBD6E3', accent: '#356D85', badgeBg: '#D8EAF2', badgeText: '#173E4F', title: '#102A36', time: '#275569' }, // Soft Mist Cyan
];

function getSoftPaletteIndex(seed) {
  const str = String(seed || 'SUBJ');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % SOFT_SUBJECT_PALETTE.length;
}

/**
 * Stack overlapping events on the same day vertically at full column width so
 * subject codes, titles, and time ranges remain completely readable, and assign
 * distinct soft pastel colors to overlapping or unassigned-pool cards.
 */
function layoutDayEvents(daySchedules, endMin = GRID_END_MIN_STANDARD, dayKey = '', stackOrders = {}) {
  const sorted = [...daySchedules]
    .map((s) => {
      const rawStart = minutesOf(s.start_time);
      const rawEnd = minutesOf(s.end_time);
      const clampedStart = Math.max(GRID_START_MIN, Math.min(endMin - 15, rawStart));
      const clampedEnd = Math.max(clampedStart + 20, Math.min(endMin, rawEnd));
      const durMins = Math.max(0, rawEnd - rawStart);
      const heightPx = Math.max(28, (clampedEnd - clampedStart) * PX_PER_MINUTE);
      const isLongCard = durMins > 120 || heightPx >= 180;
      const topPx = (clampedStart - GRID_START_MIN) * PX_PER_MINUTE + GRID_PADDING_TOP;
      const isUnassigned = s.faculty_id == null || s.faculty_name === 'UNASSIGNED PROFESSOR';
      const displayCode = formatSubjectCode(s) || s.subject_code || 'N/A';
      const softIdx = getSoftPaletteIndex(displayCode || s.curriculum_id || s.id);
      const color = isUnassigned ? SOFT_SUBJECT_PALETTE[softIdx] : getFacultyColor(s.faculty_name);
      const isLab = isLabSession(s);
      const isComb = isCombinedCSubject({
        code: s.subject_code,
        type: s.curriculum_type || s.curriculum?.type,
      });
      const subjectTitle =
        s.subject_name ||
        (typeof s.subject === 'string' ? s.subject : s.subject?.name) ||
        s.curriculum?.name ||
        s.curriculum?.subject_name ||
        s.curriculum?.subject?.name ||
        s.curriculum_name ||
        '';
      const rawRoom = s.room_name || s.room?.name || '';
      const hasRoom = Boolean(rawRoom && rawRoom.trim() !== '' && rawRoom.toUpperCase() !== 'TBA');
      const rawSection = s.section || '';
      const hasSection = Boolean(rawSection && rawSection.trim() !== '' && rawSection.toLowerCase() !== 'no section');
      const timeRangeLabel = `${to12h(s.start_time)} – ${to12h(s.end_time)}`;

      return {
        sched: s,
        startMin: rawStart,
        endMin: rawEnd,
        clampedStart,
        clampedEnd,
        durMins,
        heightPx,
        isLongCard,
        topPx,
        color,
        softIdx,
        isLab,
        isComb,
        displayCode,
        subjectTitle,
        rawRoom,
        hasRoom,
        rawSection,
        hasSection,
        timeRangeLabel,
        isStacked: false,
      };
    })
    .sort((a, b) => a.clampedStart - b.clampedStart || a.clampedEnd - b.clampedEnd);

  const clusters = [];
  let currentCluster = [];
  let clusterMaxEnd = -1;

  for (const item of sorted) {
    if (currentCluster.length === 0 || item.clampedStart < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.clampedEnd);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = item.clampedEnd;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const positioned = [];
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      positioned.push({
        ...cluster[0],
        isStacked: false,
        stackIndex: 0,
        isBackCard: false,
        zIndex: 10,
        clusterKey: null,
        clusterIds: null,
      });
      continue;
    }

    // Build stable cluster key & default Solitaire order (Back -> Front):
    // The first subject sits in the very front (last element), with the remaining
    // overlapping subjects stacked cleanly behind it at the top.
    const sortedByStart = [...cluster].sort(
      (a, b) => a.clampedStart - b.clampedStart || Number(a.sched.id) - Number(b.sched.id)
    );
    const canonicalIds = sortedByStart.map((i) => i.sched.id).sort((a, b) => Number(a) - Number(b));
    const clusterKey = `${dayKey}::${canonicalIds.join('-')}`;
    const defaultOrderIds = [
      ...sortedByStart.slice(1).map((i) => i.sched.id),
      sortedByStart[0].sched.id,
    ];

    const savedOrder = stackOrders[clusterKey];
    const itemById = new Map(cluster.map((i) => [i.sched.id, i]));
    let activeOrderIds = defaultOrderIds;
    if (
      Array.isArray(savedOrder) &&
      savedOrder.length === cluster.length &&
      savedOrder.every((id) => itemById.has(id))
    ) {
      activeOrderIds = savedOrder;
    }

    const orderedCluster = activeOrderIds.map((id) => itemById.get(id));
    const frontItem = orderedCluster[orderedCluster.length - 1];
    const frontDurPx = Math.max(72, (frontItem.clampedEnd - frontItem.clampedStart) * PX_PER_MINUTE);
    const peekPx = Math.min(
      34,
      Math.max(26, Math.floor((frontDurPx - 68) / Math.max(1, orderedCluster.length - 1)))
    );

    const usedColorIndices = new Set();
    // Anchor stacked Solitaire cards to the cluster's earliest start so bringing an
    // earlier-starting card to the front never shifts it downward past its real start time.
    const clusterMinStart = Math.min(...orderedCluster.map((i) => i.clampedStart));
    const clusterMinTopPx = (clusterMinStart - GRID_START_MIN) * PX_PER_MINUTE + GRID_PADDING_TOP;

    orderedCluster.forEach((item, idx) => {
      let cIdx = item.softIdx;
      while (usedColorIndices.has(cIdx) && usedColorIndices.size < SOFT_SUBJECT_PALETTE.length) {
        cIdx = (cIdx + 1) % SOFT_SUBJECT_PALETTE.length;
      }
      usedColorIndices.add(cIdx);

      const isBackCard = idx < orderedCluster.length - 1;
      const naturalBottomPx = (item.clampedEnd - GRID_START_MIN) * PX_PER_MINUTE + GRID_PADDING_TOP;
      const cardTopPx = clusterMinTopPx + idx * peekPx;
      // Back cards collapse neatly behind the front card and only expand to full duration when clicked to front
      const cardHeightPx = isBackCard
        ? peekPx + 18
        : Math.max(58, naturalBottomPx - cardTopPx);

      positioned.push({
        ...item,
        topPx: cardTopPx,
        heightPx: cardHeightPx,
        isStacked: true,
        stackIndex: idx,
        isBackCard,
        zIndex: 10 + idx,
        clusterKey,
        clusterIds: activeOrderIds,
        isLongCard: !isBackCard && (item.durMins > 120 || cardHeightPx >= 180),
        color: SOFT_SUBJECT_PALETTE[cIdx],
      });
    });
  }

  return positioned;
}

function WeeklyTimetableGrid({
  schedules = [],
  viewMode = 'faculty', // 'faculty' | 'section' | 'week'
  department,
  canEditSchedules = false,
  conflictedCurriculumIds = new Set(),
  isLensOpen = false,
  onEditSchedule,
  onToggleLock,
  onDeleteSchedule,
  onQuickAdd,
  onCardEnter,
  onCardLeave,
}) {
  const userDept = department || getDepartment();
  const isCvmas = String(userDept || '').trim().toUpperCase() === 'CVMAS';
  const hasLateClasses = (schedules || []).some((s) => minutesOf(s.end_time) > GRID_END_MIN_STANDARD);
  const gridEndMin = (isCvmas || hasLateClasses) ? GRID_END_MIN_EXTENDED : GRID_END_MIN_STANDARD;

  const totalGridMinutes = gridEndMin - GRID_START_MIN;
  const totalGridHeight = Math.round(totalGridMinutes * PX_PER_MINUTE) + GRID_PADDING_TOP;

  const timeTicks = useMemo(() => buildTimeTicks(gridEndMin), [gridEndMin]);

  const handleDayColumnClick = (day, e) => {
    if (!canEditSchedules || !onQuickAdd) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top - GRID_PADDING_TOP;
    if (offsetY < 0 || offsetY >= totalGridMinutes * PX_PER_MINUTE) return;
    const slotIndex = Math.floor(offsetY / HALF_HOUR_PX);
    const slotMin = GRID_START_MIN + slotIndex * 30;
    if (slotMin >= gridEndMin) return;
    const h24 = Math.floor(slotMin / 60);
    const m24 = slotMin % 60;
    const quickAddEnd = Math.min(gridEndMin, slotMin + 80);
    const eH24 = Math.floor(quickAddEnd / 60);
    const eM24 = quickAddEnd % 60;
    const startStr = `${String(h24).padStart(2, '0')}:${String(m24).padStart(2, '0')}`;
    const endStr = `${String(eH24).padStart(2, '0')}:${String(eM24).padStart(2, '0')}`;
    onQuickAdd(day, startStr, endStr);
  };

  const [stackOrders, setStackOrders] = useState({});

  const handleBringCardToFront = useCallback((clusterKey, currentIds, clickedId) => {
    if (!clusterKey || !Array.isArray(currentIds) || currentIds.length < 2) return;
    setStackOrders((prev) => {
      const order = Array.isArray(prev[clusterKey]) && prev[clusterKey].length === currentIds.length
        ? prev[clusterKey]
        : currentIds;
      const oldFrontId = order[order.length - 1];
      if (clickedId === oldFrontId) return prev;
      const middle = order.filter((id) => id !== clickedId && id !== oldFrontId);
      // Put previous front card at the very back (index 0), clicked card at the very front (last)
      return {
        ...prev,
        [clusterKey]: [oldFrontId, ...middle, clickedId],
      };
    });
  }, []);

  const schedulesByDay = useMemo(() => {
    const map = {};
    for (const d of DAY_ORDER) {
      map[d] = [];
    }
    for (const s of schedules) {
      const head = String(s.day_of_week || '').slice(0, 3).toLowerCase();
      const dKey = DAY_ORDER.find((d) => d.toLowerCase() === head);
      if (dKey) {
        map[dKey].push(s);
      }
    }
    const laidOut = {};
    for (const d of DAY_ORDER) {
      laidOut[d] = layoutDayEvents(map[d], gridEndMin, d, stackOrders);
    }
    return laidOut;
  }, [schedules, gridEndMin, stackOrders]);

  return (
    <div className="overflow-x-auto bg-white select-none">
      <div className="min-w-[1000px]">
        {/* Day Column Headers (Shared Time Scale + Mon through Sat) */}
        <div className="grid grid-cols-[110px_repeat(6,minmax(150px,1fr))] border-b-2 border-[#8FBFA6]/60 bg-[#F4F8F5]">
          <div className="px-3 py-3.5 border-r border-[#E1E5E2] flex flex-col justify-center items-center text-center bg-[#EEF5F0] gap-1">
            <span className="font-ui text-[12px] font-black uppercase tracking-wider text-[#05301F]">
              Time Scale
            </span>
            <span className="font-data text-[12px] font-black text-[#1B432C]">
              07:30 – {gridEndMin > GRID_END_MIN_STANDARD ? '19:30' : '17:30'}
            </span>
          </div>
          {DAY_ORDER.map((day) => {
            const dayCount = schedulesByDay[day]?.length || 0;
            return (
              <div
                key={day}
                className="px-3.5 py-3 border-r last:border-r-0 border-[#E1E5E2] flex items-center justify-between"
              >
                <div>
                  <div className="font-ui text-[14.5px] font-black uppercase tracking-wide text-[#05301F]">
                    {DAY_LABEL[day] || day}
                  </div>
                  <div className="text-[12px] text-[#1B432C] font-semibold">
                    {dayCount === 1 ? '1 class' : `${dayCount} classes`}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-full font-data text-[12px] font-black ${
                    dayCount > 0
                      ? 'bg-[#05301F] text-[#E3EED4]'
                      : 'bg-[#E3EED4]/70 text-[#4D6B4A]'
                  }`}
                >
                  {dayCount}
                </span>
              </div>
            );
          })}
        </div>

        {/* Proportional Shared-Scale Timetable Body */}
        <div
          className="grid grid-cols-[110px_repeat(6,minmax(150px,1fr))] relative"
          style={{ height: `${totalGridHeight + 18}px` }}
        >
          {/* Left Shared Vertical Time Axis */}
          <div className="relative border-r border-[#E1E5E2] bg-[#FAFBF9]">
            {timeTicks.map((tick) => {
              const isFirstTick = tick.minutes === GRID_START_MIN;
              const isLastTick = tick.minutes === gridEndMin;
              const isMajor = tick.isHour || isFirstTick || isLastTick;

              return (
                <div
                  key={tick.minutes}
                  className="absolute left-0 right-0 flex items-center justify-end pr-3.5 pointer-events-none"
                  style={{
                    top: `${tick.topPx}px`,
                    transform: 'translateY(-50%)',
                  }}
                >
                  <span
                    className={`font-data tabular-nums leading-none tracking-tight ${
                      isMajor
                        ? 'text-[13px] font-black text-[#05301F]'
                        : 'text-[11.5px] font-semibold text-[#3D634B]'
                    }`}
                  >
                    {tick.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Monday - Saturday Proportional Day Columns */}
          {DAY_ORDER.map((day) => {
            const dayItems = schedulesByDay[day] || [];

            return (
              <div
                key={day}
                onClick={(e) => handleDayColumnClick(day, e)}
                title={
                  canEditSchedules && onQuickAdd
                    ? `Click any empty time slot to add a class on ${DAY_LABEL[day]}`
                    : undefined
                }
                style={{
                  backgroundImage: GRID_LINES_BACKGROUND,
                  backgroundPosition: `0 ${GRID_PADDING_TOP}px`,
                  backgroundSize: `100% ${totalGridMinutes * PX_PER_MINUTE}px`,
                  backgroundRepeat: 'no-repeat',
                }}
                className={`relative border-r last:border-r-0 border-[#E1E5E2] bg-white ${
                  canEditSchedules && onQuickAdd ? 'cursor-pointer' : ''
                }`}
              >
                {/* Plotted Class Blocks (Proportional to Exact Start & End Minutes; Interactive Solitaire Stack on Overlap) */}
                {dayItems.map(({ sched, durMins, heightPx, isLongCard, isStacked, stackIndex = 0, isBackCard = false, zIndex = 10, clusterKey, clusterIds, topPx, color, isLab, isComb, displayCode, subjectTitle, rawRoom, hasRoom, rawSection, hasSection, timeRangeLabel }) => {
                  const isUltraCompact = heightPx < 74;
                  const isCompactBanner = !isUltraCompact && heightPx < 112;
                  const solitaireStepPx = isStacked ? Math.min(10, stackIndex * 3) : 0;

                  const inConflict =
                    Boolean(sched.isConflicting) ||
                    (conflictedCurriculumIds && conflictedCurriculumIds.has(sched.curriculum_id));
                  const lensDim = isLensOpen && !inConflict;
                  const lensLit = isLensOpen && inConflict;
                  const cardGap = isStacked ? 2 : 3;

                  return (
                    <div
                      key={sched.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBackCard && clusterKey && clusterIds) {
                          handleBringCardToFront(clusterKey, clusterIds, sched.id);
                          return;
                        }
                        if (canEditSchedules && onEditSchedule) onEditSchedule(sched);
                      }}
                      onMouseEnter={(e) =>
                        onCardEnter && onCardEnter(sched, color, day, inConflict, e)
                      }
                      onMouseLeave={() => onCardLeave && onCardLeave()}
                      title={isBackCard ? `Click to bring ${displayCode} (${timeRangeLabel}) to front` : undefined}
                      style={{
                        top: `${topPx + cardGap}px`,
                        height: `${Math.max(46, heightPx - cardGap * 2)}px`,
                        left: `${4 + solitaireStepPx}px`,
                        width: `calc(100% - ${8 + solitaireStepPx}px)`,
                        zIndex,
                        backgroundColor: inConflict ? '#FEF2F2' : color.bg,
                        borderColor: inConflict ? '#F87171' : color.border,
                        color: color.title,
                      }}
                      className={`group absolute rounded-xl border transition-[top,height,box-shadow,border-color,background-color,transform] duration-200 overflow-hidden flex flex-col justify-between ${
                        isBackCard
                          ? 'shadow-[0_-1px_4px_rgba(15,23,42,0.06)] hover:-translate-y-1 hover:shadow-md hover:brightness-[0.97] cursor-pointer'
                          : isStacked
                          ? 'shadow-[0_-3px_10px_rgba(15,23,42,0.12),0_3px_8px_rgba(15,23,42,0.08)] hover:shadow-lg'
                          : 'shadow-xs hover:shadow-md hover:z-20'
                      } ${
                        isUltraCompact || isBackCard ? 'px-2.5 py-1.5' : isCompactBanner ? 'px-2.5 py-1.5' : 'px-3 py-2'
                      } ${
                        !isBackCard && (canEditSchedules && onEditSchedule ? 'cursor-pointer' : 'cursor-default')
                      } ${lensDim ? 'lens-dimmed' : ''} ${lensLit ? 'lens-conflict' : ''}`}
                    >
                      {/* Left Accent Stripe */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl pointer-events-none"
                        style={{ backgroundColor: inConflict ? '#DC2626' : color.accent }}
                      />

                      {/* Top Row: Subject Code + Component Badge (+ inline Title & Time on back/ultra-compact Solitaire strip) */}
                      <div className={`pl-1 min-w-0 ${isLongCard ? 'shrink-0' : ''}`}>
                        <div className="flex items-center justify-between gap-1.5">
                          <div className={`flex items-center gap-1.5 min-w-0 ${isUltraCompact || isBackCard ? 'flex-nowrap overflow-hidden' : 'flex-wrap'}`}>
                            {sched.is_locked && (
                              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" title="Locked" />
                            )}
                            {inConflict && (
                              <AlertTriangle
                                className="w-3.5 h-3.5 text-rose-600 shrink-0"
                                title="Schedule Conflict"
                              />
                            )}
                            <span
                              className={`font-mono font-black rounded leading-tight shrink-0 shadow-2xs ${
                                isUltraCompact || isBackCard
                                  ? 'text-[11px] px-1.5 py-0.5'
                                  : isCompactBanner
                                  ? 'text-[12px] px-1.5 py-0.5'
                                  : 'text-[13.5px] px-2 py-0.5'
                              }`}
                              style={{ backgroundColor: color.badgeBg, color: color.badgeText }}
                            >
                              {displayCode}
                            </span>
                            <span
                              className={`font-mono font-black uppercase rounded leading-tight shrink-0 ${
                                isUltraCompact || isBackCard
                                  ? 'text-[10px] px-1.5 py-0.5'
                                  : isCompactBanner
                                  ? 'text-[10.5px] px-1.5 py-0.5'
                                  : 'text-[11.5px] px-2 py-0.5'
                              } ${
                                isComb
                                  ? 'bg-purple-100 text-purple-900 border border-purple-300/80'
                                  : isLab
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300/80'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300/80'
                              }`}
                            >
                              {isComb ? 'COMB' : isLab ? 'LAB' : 'LEC'}
                            </span>
                            {(sched.is_ct || (sched.ct_tier && sched.ct_tier !== 'regular')) && (
                              <span
                                className="font-mono text-[10px] font-black uppercase px-1.5 py-0.5 rounded leading-tight shrink-0 bg-teal-50 text-teal-800 border border-teal-300"
                                title="Converted Tutorial (CT)"
                              >
                                CT
                              </span>
                            )}
                            {(isUltraCompact || isBackCard) && subjectTitle && (
                              <span
                                className="font-ui text-[11.5px] font-extrabold truncate min-w-0"
                                style={{ color: color.title }}
                                title={subjectTitle}
                              >
                                {subjectTitle}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isBackCard && canEditSchedules && (
                              <div
                                className="hidden group-hover:flex items-center gap-0.5 bg-white/95 rounded-md px-1 py-0.5 shadow-2xs border border-[#D5DFD9] shrink-0 no-print"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {onToggleLock && (
                                  <button
                                    type="button"
                                    onClick={() => onToggleLock(sched)}
                                    className="p-0.5 rounded hover:bg-slate-100 text-slate-600"
                                    title={sched.is_locked ? 'Unlock' : 'Lock'}
                                  >
                                    {sched.is_locked ? (
                                      <Unlock className="w-3.5 h-3.5 text-amber-600" />
                                    ) : (
                                      <Lock className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                                {!sched.is_locked && onDeleteSchedule && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteSchedule(sched)}
                                    className="p-0.5 rounded hover:bg-rose-50 text-rose-600"
                                    title="Delete class"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Standard/Compact Card: Subject Name sits under badges */}
                        {!isLongCard && !isUltraCompact && !isBackCard && (
                          <>
                            {subjectTitle && (
                              <div
                                className={`font-ui font-black leading-snug text-left ${
                                  isCompactBanner
                                    ? 'text-[12.5px] truncate mt-0.5'
                                    : 'text-[14px] line-clamp-2 mt-1.5'
                                }`}
                                style={{ color: color.title }}
                                title={subjectTitle}
                              >
                                {subjectTitle}
                              </div>
                            )}

                            {!isCompactBanner && (hasSection || hasRoom) && (
                              <div className="font-ui text-[13px] font-extrabold mt-1 leading-tight truncate text-[#0F2A1D] text-left">
                                {hasSection && <span>{rawSection}</span>}
                                {hasSection && hasRoom && <span className="mx-1 opacity-50">·</span>}
                                {hasRoom && (
                                  <span className="font-black text-[#05301F]">
                                    {rawRoom}
                                  </span>
                                )}
                              </div>
                            )}

                            {viewMode !== 'faculty' && sched.faculty_name && heightPx >= 112 && (
                              <div className="font-ui text-[12px] font-bold text-[#1B432C] truncate mt-0.5 text-left">
                                {sched.faculty_name}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Long Card: Subject description positioned in the left middle */}
                      {isLongCard && (
                        <div className="pl-1 min-w-0 my-auto py-2 flex flex-col justify-center text-left">
                          {subjectTitle && (
                            <div
                              className="font-ui text-[15px] font-black leading-snug line-clamp-3 text-left"
                              style={{ color: color.title }}
                              title={subjectTitle}
                            >
                              {subjectTitle}
                            </div>
                          )}

                          {(hasSection || hasRoom) && (
                            <div className="font-ui text-[13px] font-extrabold mt-1.5 leading-tight truncate text-[#0F2A1D] text-left">
                              {hasSection && <span>{rawSection}</span>}
                              {hasSection && hasRoom && <span className="mx-1 opacity-50">·</span>}
                              {hasRoom && (
                                <span className="font-black text-[#05301F]">
                                  {rawRoom}
                                </span>
                              )}
                            </div>
                          )}

                          {viewMode !== 'faculty' && sched.faculty_name && (
                            <div className="font-ui text-[12.5px] font-bold text-[#1B432C] truncate mt-1 text-left">
                              {sched.faculty_name}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bottom Row: Exact Scheduled Class Time & Duration (shown on active/front cards) */}
                      {!isBackCard && (
                        <div
                          className={`pl-1 flex items-center justify-between gap-1 font-data font-black tabular-nums shrink-0 ${
                            isUltraCompact
                              ? 'pt-0.5 text-[11px]'
                              : isCompactBanner
                              ? 'pt-1 border-t border-black/10 text-[11.5px]'
                              : 'pt-1.5 border-t border-[#AEC3B0]/40 text-[13px]'
                          }`}
                        >
                          <span className="truncate" style={{ color: color.time }}>
                            {timeRangeLabel}
                          </span>
                          <span className="text-[11px] font-black shrink-0" style={{ color: color.time }}>
                            {Number((durMins / 60).toFixed(2))}h
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(WeeklyTimetableGrid);
