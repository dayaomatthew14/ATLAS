import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import RowMenu from '../../components/ui/RowMenu';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { SelectInput } from '../../components/ui/Field';
import Badge, { DepartmentMark } from '../../components/ui/Badge';
import { DEPARTMENTS, ROLE_LABELS, focusRing, pluralize } from '../../components/ui/tokens';

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
  const [editRole, setEditRole] = useState('program_chair');
  const [editDepartment, setEditDepartment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => { fetchUsers(); }, []);

  // There is no /api/departments endpoint, so the option list is the registered
  // four plus whatever codes already exist on user records. This does not fix
  // INV-00 -- departments are still per-user strings -- but it stops the UI
  // creating new orphans, which a free-text field was one typo away from.
  const departmentOptions = useMemo(() => {
    const existing = [...new Set(users.map((u) => u.department).filter(Boolean))];
    const registered = Object.keys(DEPARTMENTS);
    const unregistered = existing.filter((d) => !registered.includes(d.toUpperCase())).sort();
    return [
      { group: 'Registered', options: registered.map((c) => ({ value: c, label: `${c} — ${DEPARTMENTS[c].name}` })) },
      ...(unregistered.length
        ? [{ group: 'Unassigned workspaces', options: unregistered.map((c) => ({ value: c, label: c })) }]
        : []),
    ];
  }, [users]);

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
    setEditRole(user.role || 'program_chair');
    setEditDepartment(user.department || '');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setIsSaving(true);
    try {
      await api.put(`/users/${editing.id}`, { role: editRole, department: editDepartment });
      addToast(`${displayName(editing)} updated.`, 'success');
      setEditing(null);
      fetchUsers();
    } catch (err) {
      addToast(err.message || 'Could not update the user.', 'error');
    } finally {
      setIsSaving(false);
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
        { label: 'Edit role and department', onSelect: () => openEdit(u) },
        {
          label: u.is_verified ? 'Revoke verification' : 'Mark as verified',
          onSelect: () => toggleVerification(u),
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
        <Button variant="secondary" icon={RefreshCw} onClick={fetchUsers}>Refresh</Button>
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
                        bg-atlas-surface border border-atlas-control placeholder:text-atlas-disabled
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
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${displayName(editing)}` : ''}
        description={editing?.email}
        size="confirm"
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="user-edit-form" loading={isSaving}>Save Changes</Button>
          </>
        }
      >
        <form id="user-edit-form" onSubmit={saveEdit} className="flex flex-col gap-5">
          <SelectInput
            label="Role"
            required
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            options={ROLE_OPTIONS}
          />
          <SelectInput
            label="Department"
            required
            hint="Departments are currently created per account, so codes such as DEPT_4 appear until they are consolidated."
            value={editDepartment}
            onChange={(e) => setEditDepartment(e.target.value)}
            options={departmentOptions}
          />
        </form>
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
