import { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, UserPlus } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import RowMenu from '../../components/ui/RowMenu';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, SelectInput } from '../../components/ui/Field';
import Badge, { DepartmentMark } from '../../components/ui/Badge';
import { ROLE_LABELS, focusRing, pluralize } from '../../components/ui/tokens';

/**
 * Users. Phase 2 Screen 4.
 *
 * Two Blockers lived here:
 *
 * HEU-01 — the component declared ({ addToast }) but App.jsx renders it with no
 * props, so all eight feedback calls were swallowed by `if (addToast)` guards.
 * Deleting a user produced no visible result whatsoever. It now consumes
 * useToast() directly, as every other screen does.
 *
 * HEU-14 — the department control posted a field that schemas.UserUpdate did
 * not declare, so the API returned 200 and discarded it. Combined with HEU-01
 * the admin saw success and got nothing. Fixed server-side (DEP-4); the control
 * here is now a select rather than free text, so it cannot mint new orphaned
 * department codes on a typo.
 */

/**
 * Relative time, because the question these columns answer is "how long ago",
 * not "on what date". The exact timestamp stays in the title attribute for when
 * the precise moment matters.
 */
const relativeTime = (iso) => {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days < 0) return 'just now';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

const exactTime = (iso) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString();
};

const EMPTY_NEW_USER = {
  first_name: '', last_name: '', email: '', contact_number: '',
  role: 'program_chair', department: '', password: '',
};

// Keep in sync with MIN_PASSWORD_LENGTH in backend/app/schemas.py
const MIN_PASSWORD_LENGTH = 12;

const ROLE_OPTIONS = [
  { value: 'program_chair', label: 'Program Chair' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'admin', label: 'System Administrator' },
];

export default function UserManagement() {
  const { addToast } = useToast();

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({
    first_name: '', last_name: '', contact_number: '', role: 'program_chair', department: '',
  });
  const [editErrors, setEditErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [colleges, setColleges] = useState([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [newUserErrors, setNewUserErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [issuedPassword, setIssuedPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.get('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsers([]);
      setLoadError('Could not load the user directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // Colleges are institutional records now, so the picker is bound to them
    // rather than to whatever strings happen to sit on existing accounts.
    api.get('/colleges')
      .then((data) => setColleges(Array.isArray(data) ? data : []))
      .catch(() => setColleges([]));
  }, []);

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'No college assigned' },
      ...colleges.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
    ],
    [colleges]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''} ${u.name || ''}`.toLowerCase();
      const matchesSearch =
        !q || name.includes(q) || (u.email || '').toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'verified' && u.is_verified) ||
        (statusFilter === 'pending' && !u.is_verified);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const isFiltered = search.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); };

  const verifiedCount = users.filter((u) => u.is_verified).length;
  const pendingCount = users.length - verifiedCount;

  const displayName = (u) =>
    u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'User';

  const openEdit = (user) => {
    setEditing(user);
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      contact_number: user.contact_number || '',
      role: user.role || 'program_chair',
      department: user.department || '',
    });
    setEditErrors({});
  };

  /** Shared by both dialogs: the API enforces these, so catch them first. */
  const validatePerson = (f, { requireEmail = false, requirePassword = false } = {}) => {
    const e = {};
    const namePattern = /^[A-Za-z\s.\-']+$/;
    if (!f.first_name.trim()) e.first_name = 'Enter a first name.';
    else if (!namePattern.test(f.first_name.trim())) e.first_name = 'Letters, spaces, hyphens and apostrophes only.';
    if (!f.last_name.trim()) e.last_name = 'Enter a last name.';
    else if (!namePattern.test(f.last_name.trim())) e.last_name = 'Letters, spaces, hyphens and apostrophes only.';
    // The contact number carries the SMS verification code, so a wrong one is
    // silent: the code simply never arrives.
    const c = (f.contact_number || '').trim();
    if (c && !/^(09\d{9}|\+639\d{9})$/.test(c)) {
      e.contact_number = 'Use 09XXXXXXXXX or +639XXXXXXXXX.';
    }
    if (requireEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
      else if (users.some((u) => (u.email || '').toLowerCase() === f.email.trim().toLowerCase())) {
        e.email = 'That email already has an account.';
      }
    }
    if (requirePassword && f.password.length < MIN_PASSWORD_LENGTH) {
      e.password = `At least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return e;
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    const errs = validatePerson(editForm);
    setEditErrors(errs);
    if (Object.keys(errs).length) return;
    setIsSaving(true);
    try {
      await api.put(`/users/${editing.id}`, {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        contact_number: editForm.contact_number.trim() || null,
        role: editForm.role,
        department: editForm.department,
      });
      addToast(`${displayName(editing)} updated.`, 'success');
      setEditing(null);
      fetchUsers();
    } catch (err) {
      addToast(err.message || 'Could not update the user.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = validatePerson(newUser, { requireEmail: true, requirePassword: true });
    if (!newUser.department && newUser.role !== 'admin') {
      // An account with no college cannot see or generate anything, so it is
      // required for the roles that work inside one.
      errs.department = 'Choose a college.';
    }
    setNewUserErrors(errs);
    if (Object.keys(errs).length) return;

    setIsCreating(true);
    try {
      const created = await api.post('/users', {
        first_name: newUser.first_name.trim(),
        last_name: newUser.last_name.trim(),
        email: newUser.email.trim().toLowerCase(),
        contact_number: newUser.contact_number.trim() || null,
        role: newUser.role,
        department: newUser.role === 'admin' ? null : newUser.department,
        password: newUser.password,
      });
      addToast(
        `${created.first_name} ${created.last_name} created and verified. They can sign in now.`,
        'success'
      );
      setIsCreateOpen(false);
      setNewUser(EMPTY_NEW_USER);
      fetchUsers();
    } catch (err) {
      addToast(err.message || 'Could not create the account.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleVerification = async (user) => {
    try {
      await api.post(`/users/${user.id}/toggle-verification`, {});
      addToast(
        user.is_verified
          ? `Verification revoked for ${displayName(user)}.`
          : `${displayName(user)} marked as verified.`,
        'success'
      );
      fetchUsers();
    } catch (err) {
      addToast(err.message || 'Could not update verification.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      addToast(`${displayName(deleteTarget)} deleted.`, 'success');
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      addToast(err.message || 'Could not delete the user.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    setIsResetting(true);
    try {
      const res = await api.post(`/users/${resetTarget.id}/reset-password`, {});
      // Shown once, never stored. The admin reads it out to the user directly,
      // which is the whole point: the self-service reset needs an inbox the
      // locked-out user may no longer be able to reach.
      setIssuedPassword(res.temporary_password || '');
    } catch (err) {
      addToast(err.message || 'Could not reset the password.', 'error');
      setResetTarget(null);
    } finally {
      setIsResetting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (u) => (
        <span className="flex flex-col">
          <span className="text-atlas-ink">{displayName(u)}</span>
          <span className="font-ui text-caption text-atlas-slate">{u.email}</span>
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (u) => ROLE_LABELS[u.role] || u.role || '—',
    },
    {
      key: 'department',
      label: 'Department',
      render: (u) => <DepartmentMark code={u.department} />,
    },
    {
      key: 'contact_number',
      label: 'Contact',
      render: (u) =>
        u.contact_number
          ? <span className="font-data text-table">{u.contact_number}</span>
          // Blank is worth stating: the number is what the SMS verification
          // code is sent to, so a missing one explains a stalled sign-up.
          : <span className="font-ui text-caption text-atlas-slate">Not set</span>,
    },
    {
      key: 'last_login',
      label: 'Last sign-in',
      render: (u) => {
        const rel = relativeTime(u.last_login);
        if (!rel) {
          return <span className="font-ui text-caption text-sem-warning">Never</span>;
        }
        return (
          <span className="font-ui text-caption text-atlas-slate" title={exactTime(u.last_login)}>
            {rel}
          </span>
        );
      },
    },
    {
      key: 'created_at',
      label: 'Added',
      render: (u) => (
        <span className="font-ui text-caption text-atlas-slate" title={exactTime(u.created_at)}>
          {relativeTime(u.created_at) || '—'}
        </span>
      ),
    },
    {
      key: 'is_verified',
      label: 'Status',
      render: (u) =>
        u.is_verified
          ? <Badge status="approved" label="Verified" />
          : <Badge status="draft" label="Pending" />,
    },
  ];

  const rowActions = (u) => (
    <RowMenu
      label={`Actions for ${displayName(u)}`}
      items={[
        { label: 'Edit account', onSelect: () => openEdit(u) },
        {
          label: u.is_verified ? 'Revoke verification' : 'Mark as verified',
          onSelect: () => toggleVerification(u),
        },
        {
          label: 'Reset password',
          onSelect: () => { setResetTarget(u); setIssuedPassword(''); },
        },
        {
          label: 'Delete user',
          destructive: true,
          onSelect: () => setDeleteTarget(u),
        },
      ]}
    />
  );

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Users</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {users.length} accounts · {verifiedCount} verified · {pendingCount} awaiting verification
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={fetchUsers}>Refresh</Button>
          <Button
            icon={UserPlus}
            onClick={() => { setNewUser(EMPTY_NEW_USER); setNewUserErrors({}); setIsCreateOpen(true); }}
          >
            Add User
          </Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or department"
            className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                        bg-white/70 backdrop-blur-sm border border-atlas-control placeholder:text-atlas-disabled
                        hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
          />
        </div>
        <div className="flex gap-3">
          <SelectInput
            label="Role"
            className="w-52"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[{ value: 'all', label: 'All roles' }, ...ROLE_OPTIONS]}
          />
          <SelectInput
            label="Status"
            className="w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'verified', label: 'Verified' },
              { value: 'pending', label: 'Pending' },
            ]}
          />
        </div>
      </div>

      <DataTable
        caption={`Users, ${pluralize(filtered.length, "result")}`}
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        error={loadError}
        onRetry={fetchUsers}
        isFiltered={isFiltered && filtered.length === 0}
        onClearFilters={clearFilters}
        emptyTitle="No user accounts."
        emptyBody="Accounts are created through registration."
        rowActions={rowActions}
      />

      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add User"
        description="Created ready to sign in — this account skips e-mail and SMS verification, so use it when a self-registration cannot get through."
        dismissible={!isCreating}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button type="submit" form="user-create-form" loading={isCreating}>Create Account</Button>
          </>
        }
      >
        <form id="user-create-form" onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="First name"
            required
            value={newUser.first_name}
            error={newUserErrors.first_name}
            onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
          />
          <TextInput
            label="Last name"
            required
            value={newUser.last_name}
            error={newUserErrors.last_name}
            onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
          />
          <div className="md:col-span-2">
            <TextInput
              label="Email"
              required
              type="email"
              hint="Used to sign in, and cannot be changed afterwards"
              placeholder="name@dlsau.edu.ph"
              value={newUser.email}
              error={newUserErrors.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
          </div>
          <TextInput
            label="Contact number"
            hint="Optional"
            placeholder="09171234567"
            value={newUser.contact_number}
            error={newUserErrors.contact_number}
            onChange={(e) => setNewUser({ ...newUser, contact_number: e.target.value })}
          />
          <SelectInput
            label="Role"
            required
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            options={ROLE_OPTIONS}
          />
          <div className="md:col-span-2">
            <SelectInput
              label="College"
              required={newUser.role !== 'admin'}
              hint={newUser.role === 'admin'
                ? 'Administrators govern every college, so this stays unset.'
                : 'Without one this account cannot see or generate anything.'}
              value={newUser.department}
              error={newUserErrors.department}
              onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
              options={departmentOptions}
            />
          </div>
          <div className="md:col-span-2">
            <TextInput
              label="Temporary password"
              required
              type="text"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters. Give it to them directly and ask them to change it.`}
              value={newUser.password}
              error={newUserErrors.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${displayName(editing)}` : ''}
        description={editing?.email}
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="user-edit-form" loading={isSaving}>Save Changes</Button>
          </>
        }
      >
        <form id="user-edit-form" onSubmit={saveEdit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="First name"
            required
            value={editForm.first_name}
            error={editErrors.first_name}
            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
          />
          <TextInput
            label="Last name"
            required
            value={editForm.last_name}
            error={editErrors.last_name}
            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
          />
          <TextInput
            label="Contact number"
            hint="Receives the SMS verification code"
            placeholder="09171234567"
            value={editForm.contact_number}
            error={editErrors.contact_number}
            onChange={(e) => setEditForm({ ...editForm, contact_number: e.target.value })}
          />
          <SelectInput
            label="Role"
            required
            value={editForm.role}
            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            options={ROLE_OPTIONS}
          />
          <div className="md:col-span-2">
            <SelectInput
              label="College"
              hint={editForm.role === 'admin'
                ? 'Administrators govern every college, so this stays unset.'
                : 'Without one this account cannot see or generate anything.'}
              value={editForm.department}
              onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
              options={departmentOptions}
            />
          </div>
          {/* The email is the sign-in identifier and is not editable here. */}
          <p className="md:col-span-2 font-ui text-caption text-atlas-slate">
            Signs in with <span className="font-data">{editing?.email}</span>. To change an email
            address, create a new account and delete this one.
          </p>
        </form>
      </Dialog>

      <Dialog
        isOpen={Boolean(resetTarget)}
        onClose={() => { setResetTarget(null); setIssuedPassword(''); }}
        title={issuedPassword ? 'Temporary password issued' : `Reset password for ${resetTarget ? displayName(resetTarget) : ''}?`}
        description={
          issuedPassword
            ? undefined
            : 'Their current password stops working immediately and they are signed out everywhere.'
        }
        size="confirm"
        dismissible={!isResetting}
        footer={
          issuedPassword ? (
            <Button onClick={() => { setResetTarget(null); setIssuedPassword(''); }}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setResetTarget(null)} disabled={isResetting}>Cancel</Button>
              <Button variant="destructive" onClick={confirmReset} loading={isResetting}>
                Reset Password
              </Button>
            </>
          )
        }
      >
        {issuedPassword ? (
          <div className="flex flex-col gap-3">
            <p className="font-ui text-body text-atlas-ink">
              Give this to {resetTarget ? displayName(resetTarget) : 'the user'} directly. It is shown
              once and cannot be retrieved again.
            </p>
            <p className="font-data text-lead text-atlas-ink bg-atlas-canvas border border-atlas-line rounded-field px-4 py-3 break-all select-all">
              {issuedPassword}
            </p>
            <p className="font-ui text-caption text-atlas-slate">
              Ask them to change it from Settings once they are signed in.
            </p>
          </div>
        ) : (
          <p className="font-ui text-body text-atlas-slate">
            Use this when someone cannot receive the self-service reset email — the temporary
            password is shown to you here so you can pass it on another way.
          </p>
        )}
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteTarget ? `Delete ${displayName(deleteTarget)}?` : ''}
        description={
          deleteTarget
            ? `This removes the account and its department workspace ${deleteTarget.department || '—'}. Schedules created by this user are retained.`
            : ''
        }
        confirmLabel="Delete User"
        confirmPhrase={deleteTarget ? displayName(deleteTarget) : undefined}
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
