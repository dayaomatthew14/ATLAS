import Button from './Button';

/**
 * ATLAS data table. Phase 1 §1.2 and §1.4.
 *
 * Sticky header, sticky first column, hairline rows, NO zebra striping,
 * green-050 on hover, green-100 when selected, 13px with mono numerics.
 * Row height follows --row-h so the density toggle needs no re-render.
 *
 * Column shape:
 *   { key, label, render?, numeric?, align?, width?, srOnlyLabel? }
 *
 * `numeric: true` right-aligns and switches to tabular mono, so figures scan
 * vertically — the existing tables render capacities and units as bold sans,
 * which cannot be compared down a column.
 */
export default function DataTable({
  columns = [],
  rows = [],
  keyField = 'id',
  isLoading = false,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet.',
  emptyBody,
  emptyAction,
  isFiltered = false,
  onClearFilters,
  selectedId,
  caption,
  rowActions,
}) {
  const headCell =
    'sticky top-0 z-sticky bg-slate-50 px-5 py-4 ' +
    'font-ui text-caption font-bold text-black text-left whitespace-nowrap tracking-wider uppercase ' +
    'border-b border-slate-200';

  if (isLoading) {
    return (
      <div className="bg-white rounded-panel overflow-hidden border border-slate-200 shadow-sm" aria-busy="true">
        <div className="h-11 border-b border-slate-200 bg-slate-50" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 border-b border-slate-200 last:border-0 bg-white"
            style={{ height: 'var(--row-h)' }}
          >
            <div className="h-3 w-1/4 rounded-sm bg-slate-200 animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-1/3 rounded-sm bg-slate-200 animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-16 rounded-sm bg-slate-200 animate-pulse motion-reduce:animate-none" />
          </div>
        ))}
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-panel border border-rose-200 p-6 text-center shadow-sm">
        <p className="font-ui text-body text-slate-800">{error}</p>
        {onRetry && (
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" onClick={onRetry}>Retry</Button>
          </div>
        )}
      </div>
    );
  }

  if (!rows.length) {
    // An empty result set and an empty dataset are different states with
    // different remedies. The existing UI shows "No data found" for both.
    return (
      <div className="bg-white rounded-panel border border-slate-200 shadow-sm p-12 text-center">
        <h3 className="font-display text-section text-slate-900 font-bold">
          {isFiltered ? 'No results match your filters.' : emptyTitle}
        </h3>
        {(isFiltered || emptyBody) && (
          <p className="mt-2 font-ui text-body text-slate-600 font-medium">
            {isFiltered ? 'Clear the filters or widen your search.' : emptyBody}
          </p>
        )}
        <div className="mt-5 flex justify-center">
          {isFiltered
            ? onClearFilters && (
                <Button variant="secondary" onClick={onClearFilters}>Clear Filters</Button>
              )
            : emptyAction}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-panel overflow-x-auto border border-slate-200 shadow-sm">
      <table className="w-full border-collapse bg-white">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={[
                  headCell,
                  c.numeric ? 'text-right' : '',
                  // Sticky first column keeps the row's identity visible while
                  // wide tables scroll horizontally.
                  i === 0 ? 'sticky left-0 z-sticky bg-slate-50' : '',
                ].join(' ')}
              >
                {c.srOnlyLabel ? <span className="sr-only">{c.label}</span> : c.label}
              </th>
            ))}
            {rowActions && (
              <th scope="col" className={`${headCell} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row) => {
            const selected = selectedId != null && row[keyField] === selectedId;
            return (
              <tr
                key={row[keyField]}
                aria-selected={selected || undefined}
                className={[
                  'transition-colors duration-state ease-standard group bg-white',
                  selected
                    ? '!bg-emerald-50'
                    : 'hover:bg-slate-50 even:bg-slate-50/50',
                ].join(' ')}
                style={{ height: 'var(--row-h)' }}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={[
                      'px-5 py-4 text-body text-black align-middle border-b border-slate-200',
                      // Exactly one font class. Applying `font-ui` on the base
                      // and `font-data` as a modifier does NOT work: equal
                      // specificity means Tailwind's stylesheet order decides,
                      // not the order in the class attribute, and numerics
                      // silently rendered in Plex Sans.
                      c.numeric ? 'text-right font-data tabular-nums' : 'font-ui',
                      i === 0
                        ? `sticky left-0 ${
                            selected
                              ? 'bg-emerald-50'
                              : 'bg-white group-hover:bg-slate-50 group-even:bg-slate-50/50'
                          }`
                        : '',
                    ].join(' ')}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-5 py-4 text-right whitespace-nowrap border-b border-slate-200 bg-transparent">
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
