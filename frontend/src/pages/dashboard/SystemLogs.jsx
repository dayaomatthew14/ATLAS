import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { SelectInput } from '../../components/ui/Field';
import Badge from '../../components/ui/Badge';
import { focusRing, pluralize, restrictionReason } from '../../components/ui/tokens';

/**
 * Activity. Phase 2 Screen 8.
 *
 * HEU-05: this screen rendered `log.user` and filtered on `log.activity_type`.
 * Neither field is returned by the API — SystemLogResponse carries user_id,
 * action, details, status and timestamp, plus a computed `type` hardcoded to
 * "USER_ACTIVITY". So every row showed an empty user, every status chip read
 * "USER ACTIVITY", and the "AI Generation" and "Security" filters could never
 * match anything. The columns now follow the actual response.
 */

const POLL_MS = 15000;

export default function SystemLogs() {
  const { addToast } = useToast();
  const role = (localStorage.getItem('atlas_role') || 'guest').toLowerCase();
  const isAdmin = role === 'admin';

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

  // user_id -> name. The API returns the id only; the old screen read a `user`
  // field that was never sent, so the column was always blank.
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/users').then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [isAdmin]);

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

  const secondsAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated) / 1000) : null;

  const columns = [
    {
      key: 'time',
      label: 'When',
      width: '150px',
      render: (l) => <span className="font-data text-atlas-slate">{l.time}</span>,
    },
    { key: 'action', label: 'Action' },
    {
      key: 'details',
      label: 'Detail',
      render: (l) => <span className="text-atlas-slate">{l.details || '—'}</span>,
    },
    {
      key: 'user_id',
      label: 'By',
      width: '170px',
      render: (l) => userName(l.user_id),
    },
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      render: (l) => {
        if (l.status === 'error') return <Badge status="conflict" label="Error" />;
        if (l.status === 'warning') return <Badge status="review" label="Warning" />;
        return <Badge status="approved" label="OK" />;
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

      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="log-search" className="sr-only">Search activity</label>
          <input
            id="log-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, detail, or person"
            className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                        bg-atlas-surface border border-atlas-control placeholder:text-atlas-disabled
                        hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
          />
        </div>
        <div className="flex gap-3">
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
      />

      {/* The footer used to claim "Auto-updating in real-time" for a 15-second
          poll, with nothing to show when it last succeeded. */}
      <p className="mt-3 font-ui text-caption text-atlas-slate">
        Showing {pluralize(filtered.length, 'entry', 'entries')}
        {secondsAgo !== null && ` · updated ${secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`} · refreshes every ${POLL_MS / 1000}s`}
      </p>

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
