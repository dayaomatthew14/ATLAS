import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Monitor, FlaskConical, Presentation } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, NumberInput, SelectInput, RadioGroup } from '../../components/ui/Field';
import { restrictionReason, focusRing, pluralize } from '../../components/ui/tokens';

/**
 * Rooms. Phase 2 Screen 3.
 *
 * The Blocker this screen carried (HEU-02): the room type control offered only
 * "Science Laboratory" and "Computer Laboratory". Lecture rooms could not be
 * created at all, so lecture subjects had no matching room and
 * /schedules/suggestions silently returned an empty list. A missing <option>
 * is invisible; the type control is now a radio group, where a missing option
 * would be obvious.
 */

const ROOM_TYPES = [
  { value: 'lecture', label: 'Lecture', icon: Presentation, hint: 'Lecture subjects are scheduled here' },
  { value: 'lab', label: 'Laboratory', icon: FlaskConical, hint: 'Science and general laboratory subjects' },
  { value: 'computer_lab', label: 'Computer Laboratory', icon: Monitor, hint: 'Computer laboratory subjects' },
];

const typeMeta = (value) => ROOM_TYPES.find((t) => t.value === value) || ROOM_TYPES[0];

const EMPTY_FORM = { name: '', building: '', capacity: '', type: 'lecture' };

export default function Rooms() {
  const { addToast } = useToast();
  const role = (localStorage.getItem('atlas_role') || 'guest').toLowerCase();

  // Rooms are shared, so creating is open to every scheduling role, but editing
  // and deleting mutate a resource other departments reference (DEP-2).
  const canCreate = ['admin', 'program_chair', 'coordinator'].includes(role);
  const canModify = role === 'admin';

  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRooms = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.get('/rooms');
      setRooms(Array.isArray(data) ? data : []);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      const matchesSearch =
        !q ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.building || '').toLowerCase().includes(q);
      const matchesBuilding = buildingFilter === 'all' || r.building === buildingFilter;
      const matchesType = typeFilter === 'all' || r.type === typeFilter;
      return matchesSearch && matchesBuilding && matchesType;
    });
  }, [rooms, search, buildingFilter, typeFilter]);

  const isFiltered = search.trim() !== '' || buildingFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => { setSearch(''); setBuildingFilter('all'); setTypeFilter('all'); };

  const counts = useMemo(() => {
    const c = { lecture: 0, lab: 0, computer_lab: 0 };
    rooms.forEach((r) => { if (c[r.type] !== undefined) c[r.type] += 1; });
    return c;
  }, [rooms]);

  const openCreate = () => {
    setEditingRoom(null);
    setForm(EMPTY_FORM);
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
    try {
      if (editingRoom) {
        await api.put(`/rooms/${editingRoom.id}`, payload);
        addToast(`Room ${payload.name} updated.`, 'success');
      } else {
        await api.post('/rooms', payload);
        addToast(`Room ${payload.name} added.`, 'success');
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
  ];

  const rowActions = (r) =>
    canModify ? (
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

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Rooms</h1>
          {/* Rooms have no owning department in the data model. Saying so is
              more honest than implying a scope the system cannot enforce. */}
          <p className="font-ui text-body text-atlas-slate mt-1">
            Shared across all departments · {rooms.length} rooms · {counts.lecture} lecture,{' '}
            {counts.lab} laboratory, {counts.computer_lab} computer laboratory
          </p>
        </div>

        {canCreate ? (
          <Button icon={Plus} onClick={openCreate}>Add Room</Button>
        ) : (
          <Button restricted restrictionReason={restrictionReason('admin', 'add rooms')}>
            Add Room
          </Button>
        )}
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
                        bg-atlas-surface border border-atlas-control placeholder:text-atlas-disabled
                        hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
          />
        </div>

        <div className="flex gap-3">
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
          emptyBody="Rooms are shared across all departments."
          emptyAction={canCreate ? <Button icon={Plus} onClick={openCreate}>Add Room</Button> : null}
          rowActions={canModify ? rowActions : undefined}
        />
      </div>

      {/* Card list below 1024 — a 5-column table cannot be read on a phone. */}
      <div className="lg:hidden flex flex-col gap-3">
        {isLoading && (
          <p className="font-ui text-body text-atlas-slate" aria-busy="true">Loading…</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-panel border border-atlas-line bg-atlas-surface p-8 text-center">
            <h2 className="font-display text-section text-atlas-ink">
              {isFiltered ? 'No results match your filters.' : 'No rooms registered.'}
            </h2>
            <p className="font-ui text-body text-atlas-slate mt-2">
              {isFiltered ? 'Clear the filters or widen your search.' : 'Rooms are shared across all departments.'}
            </p>
          </div>
        )}
        {!isLoading && filtered.map((r) => {
          const t = typeMeta(r.type);
          const Icon = t.icon;
          return (
            <div key={r.id} className="rounded-panel border border-atlas-line bg-atlas-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-data text-body text-atlas-ink">{r.name}</p>
                  <p className="font-ui text-caption text-atlas-slate mt-0.5">{r.building}</p>
                </div>
                <span className="font-data text-body tabular-nums text-atlas-ink shrink-0">{r.capacity}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-atlas-line">
                <span className="inline-flex items-center gap-2 font-ui text-caption text-atlas-slate">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t.label}
                </span>
                {canModify && (
                  <span className="flex gap-1">
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
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingRoom ? `Edit ${editingRoom.name}` : 'Add Room'}
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="room-form" loading={isSaving}>
              {editingRoom ? 'Save Room' : 'Add Room'}
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
              hint="Determines which subjects can be scheduled here"
              options={ROOM_TYPES.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
            />
          </div>
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
        description="Rooms are shared across all departments. A room that still has classes scheduled in it cannot be deleted."
        confirmLabel="Delete Room"
        destructive
        loading={isDeleting}
        blocked={Boolean(deleteBlockedReason)}
        blockedReason={deleteBlockedReason}
      />
    </div>
  );
}
