import { useMemo, memo } from 'react';
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

/** Precomputed 30-minute background grid slot intervals */
function buildGridSlots(ticks, endMin) {
  const slots = [];
  for (let i = 0; i < ticks.length - 1; i += 1) {
    const tick = ticks[i];
    const h24 = Math.floor(tick.minutes / 60);
    const m24 = tick.minutes % 60;
    const quickAddEnd = Math.min(endMin, tick.minutes + 80);
    const eH24 = Math.floor(quickAddEnd / 60);
    const eM24 = quickAddEnd % 60;
    const startStr = `${String(h24).padStart(2, '0')}:${String(m24).padStart(2, '0')}`;
    const endStr = `${String(eH24).padStart(2, '0')}:${String(eM24).padStart(2, '0')}`;

    slots.push({
      minutes: tick.minutes,
      topPx: tick.topPx,
      isHour: tick.isHour,
      label: tick.label,
      startStr,
      endStr,
    });
  }
  return slots;
}

/**
 * Assign side-by-side lane indices (`laneIndex`, `laneCount`) to any overlapping
 * events on the same day so blocks never visually cover one another.
 */
function layoutDayEvents(daySchedules, endMin = GRID_END_MIN_STANDARD) {
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
      const color = getFacultyColor(s.faculty_name);
      const isLab = isLabSession(s);
      const isComb = isCombinedCSubject({
        code: s.subject_code,
        type: s.curriculum_type || s.curriculum?.type,
      });
      const displayCode = formatSubjectCode(s) || s.subject_code || 'N/A';
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
        isLab,
        isComb,
        displayCode,
        subjectTitle,
        rawRoom,
        hasRoom,
        rawSection,
        hasSection,
        timeRangeLabel,
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
    const lanes = [];
    for (const item of cluster) {
      let assignedLane = -1;
      for (let i = 0; i < lanes.length; i += 1) {
        if (lanes[i] <= item.clampedStart) {
          assignedLane = i;
          lanes[i] = item.clampedEnd;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push(item.clampedEnd);
      }
      item.laneIndex = assignedLane;
    }
    const laneCount = Math.max(1, lanes.length);
    for (const item of cluster) {
      positioned.push({
        ...item,
        laneCount,
      });
    }
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
  const gridSlots = useMemo(() => buildGridSlots(timeTicks, gridEndMin), [timeTicks, gridEndMin]);

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
      laidOut[d] = layoutDayEvents(map[d], gridEndMin);
    }
    return laidOut;
  }, [schedules, gridEndMin]);

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
                className="relative border-r last:border-r-0 border-[#E1E5E2] bg-white"
              >
                {/* 30-minute background horizontal guide lines & quick-add click zones */}
                {gridSlots.map((slot) => (
                  <div
                    key={slot.minutes}
                    onClick={() => {
                      if (canEditSchedules && onQuickAdd) {
                        onQuickAdd(day, slot.startStr, slot.endStr);
                      }
                    }}
                    className={`absolute left-0 right-0 border-b ${
                      slot.isHour ? 'border-[#D5DFD9]' : 'border-[#EEF3EF]'
                    } ${
                      canEditSchedules && onQuickAdd
                        ? 'hover:bg-[#E3EED4]/35 cursor-pointer transition-colors'
                        : ''
                    }`}
                    style={{
                      top: `${slot.topPx}px`,
                      height: `${30 * PX_PER_MINUTE}px`,
                    }}
                    title={
                      canEditSchedules && onQuickAdd
                        ? `Click to add class on ${DAY_LABEL[day]} at ${slot.label}`
                        : undefined
                    }
                  />
                ))}

                {/* Plotted Class Blocks (Proportional to Exact Start & End Minutes) */}
                {dayItems.map(({ sched, durMins, heightPx, isLongCard, topPx, color, isLab, isComb, displayCode, subjectTitle, rawRoom, hasRoom, rawSection, hasSection, timeRangeLabel, laneIndex, laneCount }) => {
                  const widthPct = 100 / laneCount;
                  const leftPct = laneIndex * widthPct;

                  const inConflict =
                    Boolean(sched.isConflicting) ||
                    (conflictedCurriculumIds && conflictedCurriculumIds.has(sched.curriculum_id));
                  const lensDim = isLensOpen && !inConflict;
                  const lensLit = isLensOpen && inConflict;

                  return (
                    <div
                      key={sched.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canEditSchedules && onEditSchedule) onEditSchedule(sched);
                      }}
                      onMouseEnter={(e) =>
                        onCardEnter && onCardEnter(sched, color, day, inConflict, e)
                      }
                      onMouseLeave={() => onCardLeave && onCardLeave()}
                      style={{
                        top: `${topPx + 3}px`,
                        height: `${Math.max(28, heightPx - 6)}px`,
                        left: `calc(${leftPct}% + 4px)`,
                        width: `calc(${widthPct}% - 8px)`,
                        backgroundColor: inConflict ? '#FEF2F2' : color.bg,
                        borderColor: inConflict ? '#F87171' : color.border,
                        color: color.title,
                      }}
                      className={`group absolute z-10 rounded-xl border px-3 py-2 shadow-xs hover:shadow-md hover:z-20 transition-[box-shadow,border-color,background-color] duration-150 overflow-hidden flex flex-col justify-between ${
                        canEditSchedules && onEditSchedule ? 'cursor-pointer' : 'cursor-default'
                      } ${lensDim ? 'lens-dimmed' : ''} ${lensLit ? 'lens-conflict' : ''}`}
                    >
                      {/* Left Accent Stripe */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl pointer-events-none"
                        style={{ backgroundColor: inConflict ? '#DC2626' : color.accent }}
                      />

                      {/* Top Row: Subject Code + Component Badge + Quick Actions */}
                      <div className={`pl-1 min-w-0 ${isLongCard ? 'shrink-0' : ''}`}>
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            {sched.is_locked && (
                              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" title="Locked" />
                            )}
                            {inConflict && (
                              <AlertTriangle
                                className="w-4 h-4 text-rose-600 shrink-0"
                                title="Schedule Conflict"
                              />
                            )}
                            <span
                              className="font-mono text-[13.5px] font-black px-2 py-0.5 rounded leading-tight truncate shadow-2xs"
                              style={{ backgroundColor: color.badgeBg, color: color.badgeText }}
                            >
                              {displayCode}
                            </span>
                            <span
                              className={`font-mono text-[11.5px] font-black uppercase px-2 py-0.5 rounded leading-tight shrink-0 ${
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
                                className="font-mono text-[10.5px] font-black uppercase px-1.5 py-0.5 rounded leading-tight shrink-0 bg-teal-50 text-teal-800 border border-teal-300"
                                title="Converted Tutorial (CT)"
                              >
                                CT
                              </span>
                            )}
                          </div>

                          {canEditSchedules && (
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

                        {/* Standard/Short Card: Subject Name sits under badges */}
                        {!isLongCard && (
                          <>
                            {heightPx >= 50 && subjectTitle && (
                              <div
                                className="font-ui text-[14px] font-black leading-snug line-clamp-2 mt-1.5 text-left"
                                style={{ color: color.title }}
                                title={subjectTitle}
                              >
                                {subjectTitle}
                              </div>
                            )}

                            {(hasSection || hasRoom) && (
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

                            {viewMode !== 'faculty' && sched.faculty_name && heightPx >= 88 && (
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

                      {/* Bottom Row: Exact Scheduled Class Time & Duration */}
                      <div className="pl-1 pt-1.5 border-t border-[#AEC3B0]/40 flex items-center justify-between gap-1 text-[13px] font-data font-black tabular-nums truncate shrink-0">
                        <span className="truncate" style={{ color: color.time }}>
                          {timeRangeLabel}
                        </span>
                        <span className="text-[11.5px] font-black text-[#1B432C] shrink-0">
                          {Number((durMins / 60).toFixed(2))}h
                        </span>
                      </div>
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
