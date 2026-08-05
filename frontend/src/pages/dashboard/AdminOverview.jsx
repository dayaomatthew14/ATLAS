import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, AlertTriangle } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import { ROLE_LABELS, pluralize } from '../../components/ui/tokens';

/**
 * Administrator overview.
 *
 * Replaces a "System Governance & Security Command Center" whose four headline
 * metrics were literals: "100% Online", "0 Alerts" and "API Latency: 14ms" were
 * hardcoded strings, not measurements, and the health panel reported four
 * services as green without checking any of them. A dashboard that invents its
 * own health is worse than one that shows nothing, because it is trusted.
 *
 * Everything here is derived from a real response. Where a number cannot be
 * measured it is not displayed.
 */

const TERM_LABELS = { '1st': '1st Term', '2nd': '2nd Term', '3rd semester': 'Midyear' };
const termLabel = (t) => TERM_LABELS[t] || t || '—';

function Panel({ title, description, action, children }) {
  return (
    <section className="glass rounded-panel overflow-hidden">
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/45">
        <div className="min-w-0">
          <h2 className="font-ui text-body font-semibold text-atlas-ink">{title}</h2>
          {description && (
            <p className="font-ui text-caption text-atlas-slate mt-0.5">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A single number with its label. No trend arrows — there is no history to compare against. */
function Stat({ label, value, tone = 'default', to }) {
  const toneClass =
    tone === 'warning' ? 'text-sem-warning'
    : tone === 'good' ? 'text-atlas-700'
    : 'text-atlas-ink';

  const body = (
    <>
      <span className="font-ui text-micro uppercase text-atlas-slate">{label}</span>
      <span className={`block font-display text-page mt-1 tabular-nums ${toneClass}`}>{value}</span>
    </>
  );

  const base = 'glass rounded-panel px-5 py-4 block';
  return to ? (
    <Link
      to={to}
      className={`${base} transition-colors duration-state ease-standard hover:bg-white/85
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-700 focus-visible:ring-offset-2`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export default function AdminOverview() {
  const { addToast } = useToast();

  const [users, setUsers] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [userData, collegeData, unassignedData, semesterData] = await Promise.all([
      api.get('/users').catch(() => []),
      api.get('/colleges').catch(() => []),
      api.get('/colleges/unassigned').catch(() => []),
      api.get('/semesters').catch(() => []),
    ]);
    setUsers(Array.isArray(userData) ? userData : []);
    setColleges(Array.isArray(collegeData) ? collegeData : []);
    setUnassigned(Array.isArray(unassignedData) ? unassignedData : []);
    const sems = Array.isArray(semesterData) ? semesterData : [];
    setActiveTerm(sems.find((s) => s.is_active) || null);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = users.filter((u) => u.is_verified === false);
  const noCollege = users.filter((u) => u.role !== 'admin' && !u.department);

  const allPrograms = colleges.flatMap((c) => c.programs);
  const programCount = allPrograms.length;
  const withCurriculum = allPrograms.filter((p) => p.block_count > 0).length;
  const missingCurriculum = allPrograms.filter((p) => p.block_count === 0);

  const displayName = (u) =>
    u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'User';

  const approve = async (user) => {
    setApprovingId(user.id);
    try {
      await api.post(`/users/${user.id}/toggle-verification`, {});
      addToast(`${displayName(user)} verified.`, 'success');
      load();
    } catch (err) {
      addToast(err.message || 'Could not verify the account.', 'error');
    } finally {
      setApprovingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 flex flex-col gap-4" aria-busy="true">
        <div className="h-9 w-64 rounded-field bg-atlas-line animate-pulse motion-reduce:animate-none" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 glass rounded-panel animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
        <div className="h-52 glass rounded-panel animate-pulse motion-reduce:animate-none" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="font-display text-page text-atlas-ink">Overview</h1>
        <p className="font-ui text-body text-atlas-slate mt-1">
          {activeTerm
            ? `Active term: ${activeTerm.academic_year} ${termLabel(activeTerm.term)}`
            : 'No active term set — nothing can be generated until one is.'}
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Awaiting verification"
          value={pending.length}
          tone={pending.length > 0 ? 'warning' : 'good'}
          to="/dashboard/users"
        />
        <Stat label="Accounts" value={users.length} to="/dashboard/users" />
        <Stat
          label="Programmes with curriculum"
          value={`${withCurriculum}/${programCount}`}
          tone={withCurriculum < programCount ? 'warning' : 'good'}
          to="/dashboard/colleges"
        />
        <Stat
          label="Unassigned curriculum"
          value={unassigned.length}
          tone={unassigned.length > 0 ? 'warning' : 'good'}
          to="/dashboard/colleges"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title={`Accounts awaiting verification (${pending.length})`}
          description="New registrations cannot sign in until an administrator verifies them."
          action={
            <Link
              to="/dashboard/users"
              className="font-ui text-caption text-atlas-700 hover:underline shrink-0
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-700 rounded-sm"
            >
              All users
            </Link>
          }
        >
          {pending.length === 0 ? (
            <p className="px-5 py-8 font-ui text-body text-atlas-slate text-center">
              Every account is verified.
            </p>
          ) : (
            <ul className="divide-y divide-white/45 max-h-72 overflow-y-auto">
              {pending.map((user) => (
                <li key={user.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-ui text-body text-atlas-ink truncate">
                      {displayName(user)}
                    </span>
                    <span className="block font-ui text-caption text-atlas-slate truncate">
                      {ROLE_LABELS[user.role] || user.role} · {user.department || 'No college'}
                    </span>
                  </span>
                  <Button
                    size="row"
                    icon={Check}
                    onClick={() => approve(user)}
                    loading={approvingId === user.id}
                  >
                    Verify
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Needs attention"
          description="Gaps that stop a department from building its timetable."
        >
          <ul className="divide-y divide-white/45">
            {!activeTerm && (
              <AttentionRow
                to="/dashboard/semesters"
                label="No active academic term"
                detail="Schedules cannot be generated until one is active."
              />
            )}
            {missingCurriculum.length > 0 && (
              <AttentionRow
                to="/dashboard/colleges"
                label={`${pluralize(missingCurriculum.length, 'programme')} without curriculum`}
                detail={missingCurriculum.slice(0, 4).map((p) => p.code).join(', ')
                  + (missingCurriculum.length > 4 ? ` and ${missingCurriculum.length - 4} more` : '')}
              />
            )}
            {unassigned.length > 0 && (
              <AttentionRow
                to="/dashboard/colleges"
                label={`${pluralize(unassigned.length, 'curriculum block', 'curriculum blocks')} unassigned`}
                detail="Imported before the taxonomy existed; assign or delete."
              />
            )}
            {noCollege.length > 0 && (
              <AttentionRow
                to="/dashboard/users"
                label={`${pluralize(noCollege.length, 'account')} with no college`}
                detail="They cannot generate or see departmental data."
              />
            )}
            {activeTerm && !missingCurriculum.length && !unassigned.length && !noCollege.length && (
              <li className="px-5 py-8 font-ui text-body text-atlas-slate text-center">
                Nothing needs attention.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function AttentionRow({ to, label, detail }) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 px-5 py-3 transition-colors duration-state ease-standard
                   hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-atlas-700 focus-visible:ring-inset"
      >
        <AlertTriangle className="w-4 h-4 text-sem-warning shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-ui text-body text-atlas-ink">{label}</span>
          <span className="block font-ui text-caption text-atlas-slate truncate">{detail}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-atlas-slate shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}
