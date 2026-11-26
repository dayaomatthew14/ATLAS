import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, RefreshCw, Trash2, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { SelectInput } from '../../components/ui/Field';
import { focusRing, pluralize, restrictionReason } from '../../components/ui/tokens';
import { isAdmin as isAdminRole } from '../../utils/session';

/**
 * Activity. Phase 2 Screen 8.
 *
 * Provides audit logging with clean, concise detail column and interactive
 * status badges. Hovering or clicking on a Warning or Error badge surfaces
 * rich, understandable DLSAU policy and error breakdowns.
 */

const POLL_MS = 15000;

export function parseLogDetail(log) {
  const raw = log?.details || '';
  if (!raw) return { summary: '—', warningText: null, metrics: null, isLoadWarning: false };

  let summary = raw;
  let warningText = null;
  let metrics = null;

  // Pattern: "Generated schedule for <dept> (<term>). Schedules generated: <gen>. Unplaced: <unp>. Skipped GenEd: <skip>.[ Warning: <warn>]"
  const genMatch = raw.match(
    /^Generated schedule for ([^(]+)\s*\(([^)]+)\)\.\s*Schedules generated:\s*(\d+)\.\s*Unplaced:\s*(\d+)\.\s*Skipped GenEd:\s*(\d+)\.?(?:\s*Warning:\s*(.*))?$/i
  );

  if (genMatch) {
    const [, dept, term, genCount, unpCount, skipCount, warn] = genMatch;
    const unplacedNum = parseInt(unpCount, 10);
    metrics = {
      department: dept.trim(),
      term: term.trim(),
      generated: parseInt(genCount, 10),
      unplaced: unplacedNum,
      skippedGenEd: parseInt(skipCount, 10),
    };
    warningText = warn ? warn.trim() : null;
    summary = `${dept.trim()} (${term.trim()}) · ${genCount} scheduled${unplacedNum > 0 ? `, ${unplacedNum} unplaced` : ''}`;
  } else {
    // Check for general "Warning: ..." or policy notes
    const warnSplit = raw.match(/^(.*?)(?:\.\s*|\s+)Warning:\s*(.+)$/i);
    if (warnSplit) {
      summary = warnSplit[1].trim();
      warningText = warnSplit[2].trim();
    } else if (log?.status === 'warning') {
      warningText = raw;
    }
  }

  // If status is error and error detail exists
  if (log?.status === 'error' && !warningText) {
    const errMatch = raw.match(/(?:error|failed):\s*(.+)$/i);
    warningText = errMatch ? errMatch[1].trim() : raw;
  }

  const isLoadWarning = !!(
    warningText &&
    /teaching-load|overload|part-time ceiling|faculty/i.test(warningText)
  );

  return { summary, warningText, metrics, isLoadWarning };
}

function ActivityDetailModalBody({ log, userName }) {
  const parsed = parseLogDetail(log);
  const isError = log.status === 'error';
  const isLoadWarning = parsed.isLoadWarning;

  return (
    <div className="space-y-4 font-ui">
      {/* Event Metadata Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div>
          <span className="block text-[11px] uppercase tracking-wider font-bold text-slate-500">Action</span>
          <span className="font-semibold text-slate-900 text-sm">{log.action || '—'}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase tracking-wider font-bold text-slate-500">When</span>
          <span className="font-data text-slate-700 text-sm tabular-nums">{log.time || '—'}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase tracking-wider font-bold text-slate-500">Triggered By</span>
          <span className="font-semibold text-slate-900 text-sm truncate">{userName}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase tracking-wider font-bold text-slate-500">Status</span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isError ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isError ? 'Error' : 'Warning'}
          </span>
        </div>
      </div>

      {/* Warning / Error Callout Banner */}
      <div
        className={`p-4 rounded-xl border ${
          isError
            ? 'bg-rose-50/80 border-rose-200 text-rose-950'
            : 'bg-amber-50/80 border-amber-300 text-amber-950'
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5 font-bold text-sm">
          {isError ? (
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          )}
          <span>{isError ? 'Execution Error Details' : 'Teaching-Load Policy Notice'}</span>
        </div>
        <p className="text-sm font-medium leading-relaxed">
          {parsed.warningText || log.details}
        </p>
      </div>

      {/* Timetable Generation Metrics if available */}
      {parsed.metrics && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center">
            <span className="block text-[11px] uppercase font-bold text-emerald-800 tracking-wider">Scheduled</span>
            <span className="font-data text-2xl font-extrabold text-emerald-950 tabular-nums">
              {parsed.metrics.generated}
            </span>
          </div>
          <div
            className={`p-3 rounded-xl border text-center ${
              parsed.metrics.unplaced > 0
                ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <span className="block text-[11px] uppercase font-bold text-slate-600 tracking-wider">Unplaced</span>
            <span className="font-data text-2xl font-extrabold tabular-nums">
              {parsed.metrics.unplaced}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-700">
            <span className="block text-[11px] uppercase font-bold text-slate-600 tracking-wider">Skipped GenEd</span>
            <span className="font-data text-2xl font-extrabold tabular-nums">
              {parsed.metrics.skippedGenEd}
            </span>
          </div>
        </div>
      )}

      {/* DLSAU Overload Cascade Policy Context */}
      {isLoadWarning && (
        <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 text-slate-800">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
            DLSAU Overload & Cascade Policy Rules
          </h4>
          <ul className="text-xs space-y-1.5 text-slate-600 leading-relaxed list-disc list-inside">
            <li>
              <span className="font-semibold text-slate-800">Office Hours Deduction:</span> Overload teaching hours are deducted first from allocated office hours (max 8.5h in 2nd/3rd terms; 7.5h in 1st term).
            </li>
            <li>
              <span className="font-semibold text-slate-800">Off-Campus Hours Deduction:</span> If overload exceeds available office hours, the remaining excess is deducted from off-campus hours (5.5h in 2nd/3rd terms; 2.5h in 1st term).
            </li>
            <li>
              <span className="font-semibold text-slate-800">Consultation Hours:</span> Fixed at 6.0 hours per week and protected by university policy (never deducted).
            </li>
            <li>
              <span className="font-semibold text-slate-800">Part-Time Ceiling:</span> Maximum 12.0 teaching hours per week.
            </li>
          </ul>
        </div>
      )}

      {/* Logged Detail String */}
      <div className="text-xs text-slate-500 pt-1">
        <span className="font-semibold text-slate-700">Audit Detail: </span>
        <span className="text-slate-600 break-words">{parsed.summary}</span>
      </div>
    </div>
  );
}

export default function SystemLogs() {
  const { addToast } = useToast();
  const isAdmin = isAdminRole();

  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [, setTick] = useState(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Warning & error popover / modal state
  const [selectedLog, setSelectedLog] = useState(null);
  const [hoveredBadge, setHoveredBadge] = useState(null);

  const firstLoad = useRef(true);

  const fetchLogs = async () => {
    if (firstLoad.current) setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.get('/logs?limit=200');
      setLogs(Array.isArray(data) ? data : []);
      setLastUpdated(Date.now());
    } catch (e) {
      if (firstLoad.current) setLoadError('Could not load the activity log.');
    } finally {
      setIsLoading(false);
      firstLoad.current = false;
    }
  };

  useEffect(() => {
    fetchLogs();
    const poll = setInterval(fetchLogs, POLL_MS);
    // Drives the "updated Ns ago" label without refetching.
    const clock = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  // user_id -> name. Both Admins/Deans and Program Chairs are authorized to read
  // their college's users so the Activity Log shows real names instead of "User 5".
  useEffect(() => {
    api.get('/users').then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const userName = (id) => {
    if (!id) return 'System';
    const u = users.find((x) => x.id === id);
    if (!u) return `User ${id}`;
    return u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  };

  // Populated from what is actually in the log, not from invented categories.
  const actionOptions = useMemo(
    () => [...new Set(logs.map((l) => l.action).filter(Boolean))].sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      const matchesSearch =
        !q ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        userName(l.user_id).toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      const matchesAction = actionFilter === 'all' || l.action === actionFilter;
      return matchesSearch && matchesStatus && matchesAction;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, users, search, statusFilter, actionFilter]);

  const isFiltered = search.trim() !== '' || statusFilter !== 'all' || actionFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setActionFilter('all'); };

  const confirmClear = async () => {
    setIsClearing(true);
    try {
      await api.delete('/logs');
      addToast('Activity log cleared.', 'success');
      setIsClearOpen(false);
      fetchLogs();
    } catch (e) {
      addToast(e.message || 'Could not clear the activity log.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const handleBadgeMouseEnter = (e, l) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredBadge({ log: l, rect });
  };

  const handleBadgeMouseLeave = () => {
    setHoveredBadge(null);
  };

  const secondsAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated) / 1000) : null;

  const columns = [
    {
      key: 'time',
      label: 'When',
      width: '150px',
      render: (l) => <span className="font-data text-atlas-slate text-sm">{l.time}</span>,
    },
    { key: 'action', label: 'Action', width: '160px' },
    {
      key: 'details',
      label: 'Detail',
      render: (l) => {
        const { summary } = parseLogDetail(l);
        return (
          <span className="text-slate-800 font-medium leading-relaxed" title={l.details}>
            {summary}
          </span>
        );
      },
    },
    {
      key: 'user_id',
      label: 'By',
      width: '160px',
      render: (l) => <span className="text-slate-700 font-medium text-sm">{userName(l.user_id)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      render: (l) => {
        const parsed = parseLogDetail(l);
        if (l.status === 'warning') {
          return (
            <button
              type="button"
              onClick={() => setSelectedLog(l)}
              onMouseEnter={(e) => handleBadgeMouseEnter(e, l)}
              onMouseLeave={handleBadgeMouseLeave}
              aria-label={`Warning: ${parsed.warningText || 'Click to view warning details'}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-ui text-caption font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 hover:shadow-xs transition-all duration-state cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span>Warning</span>
            </button>
          );
        }
        if (l.status === 'error') {
          return (
            <button
              type="button"
              onClick={() => setSelectedLog(l)}
              onMouseEnter={(e) => handleBadgeMouseEnter(e, l)}
              onMouseLeave={handleBadgeMouseLeave}
              aria-label={`Error: ${parsed.warningText || 'Click to view error details'}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-ui text-caption font-bold bg-rose-50 text-rose-900 border border-rose-300 hover:bg-rose-100 hover:border-rose-400 hover:shadow-xs transition-all duration-state cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" aria-hidden="true" />
              <span>Error</span>
            </button>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-ui text-caption font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>OK</span>
          </span>
        );
      },
    },
  ];

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Activity</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {isAdmin
              ? 'Every recorded action across the system.'
              : `${localStorage.getItem('atlas_department') || 'Your department'} and system-wide events.`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={fetchLogs}>Refresh</Button>
          {isAdmin ? (
            <Button variant="destructive" icon={Trash2} onClick={() => setIsClearOpen(true)}>
              Clear Log
            </Button>
          ) : (
            <Button restricted restrictionReason={restrictionReason('admin', 'clear the activity log')}>
              Clear Log
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-col md:flex-row md:items-end gap-3 mb-5">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <label htmlFor="log-search" className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2">
            Search
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="log-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, detail, or person"
              className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                          bg-white/70 backdrop-blur-sm border border-atlas-control placeholder:text-atlas-disabled
                          hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
            />
          </div>
        </div>
        <div className="flex md:items-end gap-3">
          <SelectInput
            label="Status"
            className="w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'success', label: 'OK' },
              { value: 'warning', label: 'Warning' },
              { value: 'error', label: 'Error' },
            ]}
          />
          <SelectInput
            label="Action"
            className="w-56"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            options={[{ value: 'all', label: 'All actions' }, ...actionOptions.map((a) => ({ value: a, label: a }))]}
          />
        </div>
      </div>

      <DataTable
        caption={`Activity, ${pluralize(filtered.length, 'entry', 'entries')}`}
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        error={loadError}
        onRetry={fetchLogs}
        isFiltered={isFiltered && filtered.length === 0}
        onClearFilters={clearFilters}
        emptyTitle="No activity recorded yet."
        emptyBody="Actions appear here as people use the system."
        spotlight
      />

      <p className="mt-3 font-ui text-caption text-atlas-slate">
        Showing {pluralize(filtered.length, 'entry', 'entries')}
        {secondsAgo !== null && ` · updated ${secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`} · refreshes every ${POLL_MS / 1000}s`}
      </p>

      {/* Floating Hover Popover for Warning & Error Badges */}
      {hoveredBadge && (() => {
        const parsed = parseLogDetail(hoveredBadge.log);
        const text = parsed.warningText || hoveredBadge.log.details;
        const isError = hoveredBadge.log.status === 'error';
        const isNearTop = hoveredBadge.rect.top < 150;
        const badgeCenterX = hoveredBadge.rect.left + hoveredBadge.rect.width / 2;
        const left = Math.max(16, Math.min(window.innerWidth - 340, badgeCenterX - 150));
        const top = isNearTop ? hoveredBadge.rect.bottom + 8 : hoveredBadge.rect.top - 8;

        return (
          <div
            role="tooltip"
            className="fixed z-50 pointer-events-none transition-all duration-100 ease-out animate-fadeIn"
            style={{
              top: `${top}px`,
              left: `${left}px`,
              transform: isNearTop ? 'none' : 'translateY(-100%)',
            }}
          >
            <div
              className={`w-80 rounded-xl p-3.5 shadow-xl border bg-white ${
                isError ? 'border-rose-300' : 'border-amber-300'
              }`}
            >
              <div
                className={`flex items-center gap-2 mb-1.5 font-ui text-caption font-bold ${
                  isError ? 'text-rose-900' : 'text-amber-900'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                )}
                <span>{isError ? 'Activity Error' : 'Policy Warning'}</span>
              </div>
              <p className="font-ui text-caption text-slate-700 font-medium leading-snug">
                {text}
              </p>
              <div
                className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] font-semibold ${
                  isError
                    ? 'border-rose-100 text-rose-700'
                    : 'border-amber-100 text-amber-700'
                }`}
              >
                <span>Click badge for full breakdown</span>
                <span>DLSAU Policy</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Warning & Error Detail Dialog Modal */}
      <Dialog
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        size="confirm"
        icon={selectedLog?.status === 'error' ? AlertCircle : AlertTriangle}
        iconClassName={
          selectedLog?.status === 'error'
            ? 'w-10 h-10 rounded-xl bg-rose-500/15 text-rose-800 border border-rose-500/25 flex items-center justify-center shrink-0 shadow-xs mt-0.5'
            : 'w-10 h-10 rounded-xl bg-amber-500/15 text-amber-800 border border-amber-500/25 flex items-center justify-center shrink-0 shadow-xs mt-0.5'
        }
        title={selectedLog?.status === 'error' ? 'Activity Error Details' : 'Activity Warning Details'}
        description="Audit log entry and DLSAU policy context."
        footer={
          <Button variant="primary" onClick={() => setSelectedLog(null)}>
            Understood
          </Button>
        }
      >
        {selectedLog && (
          <ActivityDetailModalBody
            log={selectedLog}
            userName={userName(selectedLog.user_id)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        isOpen={isClearOpen}
        onClose={() => setIsClearOpen(false)}
        onConfirm={confirmClear}
        title="Clear the entire activity log?"
        description={`This permanently deletes ${pluralize(logs.length, 'entry', 'entries')}. The audit trail cannot be recovered.`}
        confirmLabel="Clear Log"
        confirmPhrase="CLEAR"
        destructive
        loading={isClearing}
      />
    </div>
  );
}
