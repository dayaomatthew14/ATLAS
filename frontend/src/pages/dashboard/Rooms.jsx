import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Monitor, FlaskConical, Presentation, Building2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import { DepartmentMark } from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, NumberInput, SelectInput, RadioGroup } from '../../components/ui/Field';
import { focusRing, pluralize } from '../../components/ui/tokens';
import {
  canEditRoom, canAddRooms, canManageDepartmentLabs,
  isDepartmentRoomType, DEPARTMENT_ROOM_TYPES, getDepartment, isAdmin as isAdminRole,
} from '../../utils/session';

/**
 * Rooms. Phase 2 Screen 3.
 *
 * The Blocker this screen carried (HEU-02): the room type control offered only
 * "Science Laboratory" and "Computer Laboratory". Lecture rooms could not be
 * created at all, so lecture subjects had no matching room and
 * /schedules/suggestions silently returned an empty list. A missing <option>
 * is invisible; the type control is now a radio group, where a missing option
 * would be obvious.
 *
 * Ownership. A room is either shared campus space or a laboratory a college
 * runs itself, and the screen has to show which — a chair looking at LAB-201
 * needs to know whether renaming it is their call or a request to make. Shared
 * rooms cover lecture halls and any laboratory the Registrar assigns; that
 * assignment happens outside ATLAS, so those simply arrive as shared rooms an
 * administrator registers.
 *
 * A college owning no laboratories is a normal state, not a gap. Nothing here
 * prompts a department to create one.
 */

const ROOM_TYPES = [
  { value: 'lecture', label: 'Lecture', icon: Presentation, hint: 'Lecture subjects are scheduled here' },
  { value: 'lab', label: 'Laboratory', icon: FlaskConical, hint: 'Science and general laboratory subjects' },
  { value: 'computer_lab', label: 'Computer Laboratory', icon: Monitor, hint: 'Computer laboratory subjects' },
];

const typeMeta = (value) => ROOM_TYPES.find((t) => t.value === value) || ROOM_TYPES[0];

const SHARED = 'shared';

export default function Rooms() {
  const { addToast } = useToast();

  const isAdmin = isAdminRole();
  const myCollege = getDepartment();
  const canManageLabs = canManageDepartmentLabs();
  const canCreate = canAddRooms();

  // A chair adds laboratories for their own college and nothing else, so their
  // form never offers a type they would be refused for.
  const creatableTypes = isAdmin
    ? ROOM_TYPES
    : ROOM_TYPES.filter((t) => DEPARTMENT_ROOM_TYPES.includes(t.value));

  const emptyForm = {
    name: '', building: '', capacity: '',
    type: creatableTypes[0]?.value || 'lab',
    owner: isAdmin ? SHARED : myCollege,
  };

  const [rooms, setRooms] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRooms = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      // Colleges are only needed to let an administrator hand a laboratory to
      // one; a failure there must not take the room list down with it.
      const [roomData, collegeData] = await Promise.all([
        api.get('/rooms'),
        isAdmin ? api.get('/colleges').catch(() => []) : Promise.resolve([]),
      ]);
      setRooms(Array.isArray(roomData) ? roomData : []);
      setColleges(Array.isArray(collegeData) ? collegeData : []);
    } catch (error) {
      setRooms([]);
      setLoadError('Could not load rooms.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, []);

  const buildings = useMemo(
    () => [...new Set(rooms.map((r) => r.building).filter(Boolean))].sort(),
    [rooms]
  );

  /** Every college that actually owns a laboratory, for the ownership filter. */
  const owningColleges = useMemo(
    () => [...new Set(rooms.map((r) => r.department_code).filter(Boolean))].sort(),
    [rooms]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      const matchesSearch =
        !q ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.building || '').toLowerCase().includes(q);
      const matchesBuilding = buildingFilter === 'all' || r.building === buildingFilter;
      const matchesType = typeFilter === 'all' || r.type === typeFilter;
      const matchesOwner =
        ownerFilter === 'all'
        || (ownerFilter === SHARED ? !r.department_code : r.department_code === ownerFilter);
      return matchesSearch && matchesBuilding && matchesType && matchesOwner;
    });
  }, [rooms, search, buildingFilter, typeFilter, ownerFilter]);

  const isFiltered =
    search.trim() !== '' || buildingFilter !== 'all' || typeFilter !== 'all' || ownerFilter !== 'all';
  const clearFilters = () => {
    setSearch(''); setBuildingFilter('all'); setTypeFilter('all'); setOwnerFilter('all');
  };

  const sharedCount = rooms.filter((r) => !r.department_code).length;
  const myLabCount = rooms.filter((r) => myCollege && r.department_code === myCollege).length;

  const openCreate = () => {
    setEditingRoom(null);
    setForm(emptyForm);
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (room) => {
    setEditingRoom(room);
    setForm({
      name: room.name || '',
      building: room.building || '',
      capacity: String(room.capacity ?? ''),
      type: room.type || 'lecture',
      owner: room.department_code || SHARED,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Enter a room name.';
    if (!form.building.trim()) errors.building = 'Enter a building.';
    const cap = Number(form.capacity);
    if (!form.capacity || Number.isNaN(cap) || cap < 1 || cap > 200) {
      errors.capacity = 'Enter a capacity between 1 and 200.';
    }
    if (isAdmin && form.owner !== SHARED && !isDepartmentRoomType(form.type)) {
      errors.owner = 'Only laboratories can be assigned to a college.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      building: form.building.trim(),
      capacity: Number(form.capacity),
      type: form.type,
    };
    // Ownership is the administrator's to set. A chair's room is filed under
    // their own college by the server, from their token — never from here.
    if (isAdmin) {
      const owner = colleges.find((c) => c.code === form.owner);
      payload.department_id = form.owner === SHARED ? null : owner?.id ?? null;
    }

    try {
      if (editingRoom) {
        await api.put(`/rooms/${editingRoom.id}`, payload);
        addToast(`Room ${payload.name} updated.`, 'success');
      } else {
        await api.post('/rooms', payload);
        addToast(
          isAdmin && form.owner === SHARED
            ? `Room ${payload.name} added.`
            : `Laboratory ${payload.name} added for ${isAdmin ? form.owner : myCollege}.`,
          'success'
        );
      }
      setIsFormOpen(false);
      fetchRooms();
    } catch (error) {
      addToast(error.message || 'Could not save the room.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/rooms/${deleteTarget.id}`);
      addToast(`Room ${deleteTarget.name} deleted.`, 'success');
      setDeleteTarget(null);
      fetchRooms();
    } catch (error) {
      // The API returns 409 with a count when the room is still timetabled.
      // Surface that as a refusal with a reason rather than a failed action.
      if (error.status === 409) setDeleteBlockedReason(error.message);
      else addToast(error.message || 'Could not delete the room.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  /** Shared vs. the owning college. The hue never appears without its code. */
  const OwnerCell = ({ room }) =>
    room.department_code ? (
      <DepartmentMark code={room.department_code} className="text-table" />
    ) : (
      <span className="inline-flex items-center gap-2 font-ui text-table text-atlas-slate">
        <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        Shared
      </span>
    );

  const columns = [
    {
      key: 'name',
      label: 'Room',
      render: (r) => <span className="font-data text-atlas-ink">{r.name}</span>,
    },
    { key: 'building', label: 'Building' },
    { key: 'capacity', label: 'Capacity', numeric: true, width: '120px' },
    {
      key: 'type',
      label: 'Type',
      render: (r) => {
        const t = typeMeta(r.type);
        const Icon = t.icon;
        return (
          <span className="inline-flex items-center gap-2">
            <Icon className="w-4 h-4 text-atlas-slate shrink-0" aria-hidden="true" />
            {t.label}
          </span>
        );
      },
    },
    {
      key: 'department_code',
      label: 'Managed by',
      width: '160px',
      render: (r) => <OwnerCell room={r} />,
    },
  ];

  // Per row, not per screen: a chair may manage their own college's laboratory
  // and nothing else in the same list. A restricted button on every other row
  // would be dozens of locks saying the same thing.
  const rowActions = (r) =>
    canEditRoom(r) ? (
      <div className="flex gap-1 justify-end">
        <Button size="row" variant="ghost" onClick={() => openEdit(r)} aria-label={`Edit room ${r.name}`}>
          Edit
        </Button>
        <Button
          size="row"
          variant="ghost"
          onClick={() => { setDeleteTarget(r); setDeleteBlockedReason(''); }}
          aria-label={`Delete room ${r.name}`}
          className="text-sem-conflict hover:bg-sem-conflict-bg"
        >
          Delete
        </Button>
      </div>
    ) : null;

  const addButton = () => {
    if (isAdmin) return <Button icon={Plus} onClick={openCreate}>Add Room</Button>;
    if (canManageLabs) return <Button icon={Plus} onClick={openCreate}>Add Laboratory</Button>;
    // The only way to reach here is a chair or coordinator with no college:
    // every other role is either an administrator or already covered above. The
    // blocker is the missing college, not the role, so say that rather than
    // naming a role they cannot become.
    return (
      <Button
        restricted
        restrictionReason="Your account is not assigned to a college, so a laboratory would have no owner. Ask an administrator to set one."
      >
        Add Laboratory
      </Button>
    );
  };

  const subtitle = isAdmin
    ? `${pluralize(rooms.length, 'room')} · ${sharedCount} shared · ${rooms.length - sharedCount} run by a college`
    : canManageLabs
      ? `${sharedCount} shared campus ${sharedCount === 1 ? 'room' : 'rooms'} · ${myLabCount} ${myCollege} ${myLabCount === 1 ? 'laboratory' : 'laboratories'} you manage`
      : `${pluralize(rooms.length, 'room')} · shared across all colleges`;

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Rooms</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">{subtitle}</p>
          {canManageLabs && (
            <p className="font-ui text-caption text-atlas-slate mt-1">
              Your college can run its own laboratories. Lecture halls, and laboratories assigned
              centrally, are shared and only an administrator can change them.
            </p>
          )}
        </div>

        {addButton()}
      </header>

      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="room-search" className="sr-only">Search rooms</label>
          <input
            id="room-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by room or building"
            className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                        bg-white/70 backdrop-blur-sm border border-atlas-control placeholder:text-atlas-disabled
                        hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <SelectInput
            label="Building"
            className="w-44"
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            options={[{ value: 'all', label: 'All buildings' }, ...buildings.map((b) => ({ value: b, label: b }))]}
          />
          <SelectInput
            label="Type"
            className="w-52"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[{ value: 'all', label: 'All types' }, ...ROOM_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          />
          <SelectInput
            label="Managed by"
            className="w-44"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Anyone' },
              { value: SHARED, label: 'Shared' },
              ...owningColleges.map((c) => ({ value: c, label: c === myCollege ? `${c} (yours)` : c })),
            ]}
          />
        </div>
      </div>

      {/* Table from 1024 up. */}
      <div className="hidden lg:block">
        <DataTable
          caption={`Rooms, ${pluralize(filtered.length, "result")}`}
          columns={columns}
          rows={filtered}
          isLoading={isLoading}
          error={loadError}
          onRetry={fetchRooms}
          isFiltered={isFiltered && filtered.length === 0}
          onClearFilters={clearFilters}
          emptyTitle="No rooms registered."
          emptyBody="Lecture halls and centrally assigned laboratories are registered by an administrator."
          emptyAction={canCreate ? addButton() : null}
          // Only reserve the actions column when at least one visible row is
          // actionable — a chair whose college runs no laboratories would
          // otherwise get an empty column across the whole campus list.
          rowActions={filtered.some(canEditRoom) ? rowActions : undefined}
        />
      </div>

      {/* Card list below 1024 — a 6-column table cannot be read on a phone. */}
      <div className="lg:hidden flex flex-col gap-3">
        {isLoading && (
          <p className="font-ui text-body text-atlas-slate" aria-busy="true">Loading…</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="glass rounded-panel p-8 text-center">
            <h2 className="font-display text-section text-atlas-ink">
              {isFiltered ? 'No results match your filters.' : 'No rooms registered.'}
            </h2>
            <p className="font-ui text-body text-atlas-slate mt-2">
              {isFiltered
                ? 'Clear the filters or widen your search.'
                : 'Lecture halls and centrally assigned laboratories are registered by an administrator.'}
            </p>
          </div>
        )}
        {!isLoading && filtered.map((r) => {
          const t = typeMeta(r.type);
          const Icon = t.icon;
          return (
            <div key={r.id} className="glass rounded-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-data text-body text-atlas-ink">{r.name}</p>
                  <p className="font-ui text-caption text-atlas-slate mt-0.5">{r.building}</p>
                </div>
                <span className="font-data text-body tabular-nums text-atlas-ink shrink-0">{r.capacity}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3">
                <span className="inline-flex items-center gap-2 font-ui text-caption text-atlas-slate">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t.label}
                </span>
                <OwnerCell room={r} />
              </div>
              {canEditRoom(r) && (
                <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-white/45">
                  <Button size="row" variant="ghost" onClick={() => openEdit(r)} aria-label={`Edit room ${r.name}`}>Edit</Button>
                  <Button
                    size="row"
                    variant="ghost"
                    onClick={() => { setDeleteTarget(r); setDeleteBlockedReason(''); }}
                    aria-label={`Delete room ${r.name}`}
                    className="text-sem-conflict hover:bg-sem-conflict-bg"
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={
          editingRoom
            ? `Edit ${editingRoom.name}`
            : isAdmin ? 'Add Room' : 'Add Laboratory'
        }
        description={
          !editingRoom && !isAdmin
            ? `This laboratory will be managed by ${myCollege}. Your college can rename or retire it at any time.`
            : undefined
        }
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="room-form" loading={isSaving}>
              {editingRoom ? 'Save Room' : isAdmin ? 'Add Room' : 'Add Laboratory'}
            </Button>
          </>
        }
      >
        <form id="room-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="Room name"
            required
            hint="As shown on schedules"
            placeholder="LSB-204"
            value={form.name}
            error={formErrors.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextInput
            label="Building"
            required
            placeholder="LSB Building"
            list="building-options"
            value={form.building}
            error={formErrors.building}
            onChange={(e) => setForm({ ...form, building: e.target.value })}
          />
          <datalist id="building-options">
            {buildings.map((b) => <option key={b} value={b} />)}
          </datalist>

          <NumberInput
            label="Capacity"
            required
            suffix="students"
            hint="1–200"
            min={1}
            max={200}
            placeholder="45"
            value={form.capacity}
            error={formErrors.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />

          <div className="md:col-span-2">
            <RadioGroup
              label="Room type"
              required
              name="room-type"
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              hint={
                isAdmin
                  ? 'Determines which subjects can be scheduled here'
                  : 'Determines which subjects can be scheduled here. Lecture halls are shared campus space and only an administrator can register one.'
              }
              options={creatableTypes.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
            />
          </div>

          {/* Ownership is an administrator's to set. A chair never sees this:
              their laboratory is filed under their own college server-side. */}
          {isAdmin && (
            <div className="md:col-span-2">
              <SelectInput
                label="Managed by"
                value={form.owner}
                error={formErrors.owner}
                hint={
                  isDepartmentRoomType(form.type)
                    ? 'A shared laboratory is one the Registrar assigns; a college-run one is that college’s to manage.'
                    : 'Lecture halls are always shared campus space.'
                }
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                disabled={!isDepartmentRoomType(form.type)}
                options={[
                  { value: SHARED, label: 'Shared campus room' },
                  ...colleges.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
                ]}
              />
            </div>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { setDeleteTarget(null); setDeleteBlockedReason(''); }}
        onConfirm={confirmDelete}
        title={deleteBlockedReason ? `${deleteTarget?.name} cannot be deleted` : `Delete ${deleteTarget?.name}?`}
        // Do not assert usage status here. This screen does not load schedules,
        // so claiming "not used by any scheduled class" was a guess that was
        // wrong whenever the room was in fact timetabled. The API's 409 carries
        // the authoritative count and switches this dialog to its blocked state.
        description={
          deleteTarget?.department_code
            ? `${deleteTarget.name} is a ${deleteTarget.department_code} laboratory. A room that still has classes scheduled in it cannot be deleted.`
            : 'Rooms are shared across all colleges. A room that still has classes scheduled in it cannot be deleted.'
        }
        confirmLabel="Delete Room"
        destructive
        loading={isDeleting}
        blocked={Boolean(deleteBlockedReason)}
        blockedReason={deleteBlockedReason}
      />
    </div>
  );
}
