import React, { useMemo, useState, useEffect } from 'react';
import Drawer from '../../shared/Drawer';
import { Badge, Card, EmptyState, TimeAgo } from '../../shared/ui';
import { useDebounce } from '../../../hooks/useDebounce';
import {
  Search,
  Download,
  Calendar,
  ChevronRight,
  AlertTriangle,
  Info,
  AlertCircle,
  X,
} from 'lucide-react';
import { AuditLog } from '../../../types/index';

/**
 * Audit Log — redesigned.
 *
 * What changed vs. the previous version:
 *  - The four stacked walls of filter chips (dates, actors, entities,
 *    severities — ~20 chips before any data appeared) are replaced by one
 *    compact toolbar: search, three dropdowns, and a date segment. Active
 *    filters render as removable pills below it.
 *  - Actors/entities/actions were rebuilt with Array.from(new Set(...)) on
 *    every render; now memoized. Search is debounced.
 *  - Timestamps show as "3m ago" with the full timestamp on hover; the
 *    redundant "Summary" column ("{Action} on {Entity} {ID}") is gone —
 *    it repeated three other columns.
 *  - Row count shown so filtering has visible feedback.
 */

interface AuditLogProps {
  auditLogs: AuditLog[];
  onExport?: () => void;
}

type Severity = 'info' | 'warning' | 'error';

const getSeverity = (action: string): Severity => {
  const a = action.toLowerCase();
  if (a.includes('error') || a.includes('failed') || a.includes('delete')) return 'error';
  if (a.includes('warning') || a.includes('overdue')) return 'warning';
  return 'info';
};

const SEVERITY_BADGE: Record<Severity, { variant: 'accent' | 'warning' | 'danger'; label: string }> = {
  info: { variant: 'accent', label: 'Info' },
  warning: { variant: 'warning', label: 'Warning' },
  error: { variant: 'danger', label: 'Error' },
};

const DATE_OPTIONS = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
] as const;

export default function AuditLogPage({ auditLogs, onExport }: AuditLogProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<(typeof DATE_OPTIONS)[number]['id']>('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');

  const debouncedSearch = useDebounce(searchQuery, 250);

  // Reset search state when component mounts to ensure isolation from other pages
  useEffect(() => {
    setSearchQuery('');
    setDateFilter('all');
    setActorFilter('all');
    setEntityFilter('all');
    setSeverityFilter('all');
  }, []);

  const actors = useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.ActionByEmail))).sort(),
    [auditLogs]
  );
  const entities = useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.EntityType))).sort(),
    [auditLogs]
  );

  const filteredLogs = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      dateFilter === 'today'
        ? new Date().setHours(0, 0, 0, 0)
        : dateFilter === 'week'
          ? now - 7 * 86400_000
          : dateFilter === 'month'
            ? now - 30 * 86400_000
            : 0;

    return auditLogs.filter((log) => {
      if (
        q &&
        !log.Action.toLowerCase().includes(q) &&
        !log.EntityID.toLowerCase().includes(q) &&
        !log.ActionByEmail.toLowerCase().includes(q)
      )
        return false;
      if (actorFilter !== 'all' && log.ActionByEmail !== actorFilter) return false;
      if (entityFilter !== 'all' && log.EntityType !== entityFilter) return false;
      if (severityFilter !== 'all' && getSeverity(log.Action) !== severityFilter) return false;
      if (cutoff && new Date(log.ActionDateTime).getTime() < cutoff) return false;
      return true;
    });
  }, [auditLogs, debouncedSearch, dateFilter, actorFilter, entityFilter, severityFilter]);

  const activePills = [
    actorFilter !== 'all' && { label: actorFilter, clear: () => setActorFilter('all') },
    entityFilter !== 'all' && { label: entityFilter, clear: () => setEntityFilter('all') },
    severityFilter !== 'all' && {
      label: SEVERITY_BADGE[severityFilter].label,
      clear: () => setSeverityFilter('all'),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const clearAll = () => {
    setSearchQuery('');
    setDateFilter('all');
    setActorFilter('all');
    setEntityFilter('all');
    setSeverityFilter('all');
  };

  const selectClass =
    'rounded-[var(--radius-sm)] border px-2.5 py-2 text-sm min-w-0';
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
  };

  return (
    <div className="admin-root p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Audit Log
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            System events and change history
          </p>
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium transition-colors"
            style={selectStyle}
          >
            <Download size={15} />
            Export
          </button>
        )}
      </div>

      {/* Toolbar — one row, not four walls of chips */}
      <Card padded={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              type="search"
              placeholder="Search action, entity ID or actor…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border py-2 pl-9 pr-3 text-sm"
              style={selectStyle}
            />
          </div>

          <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className={selectClass} style={selectStyle} aria-label="Filter by actor">
            <option value="all">All actors</option>
            {actors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className={selectClass} style={selectStyle} aria-label="Filter by entity">
            <option value="all">All entities</option>
            {entities.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className={selectClass}
            style={selectStyle}
            aria-label="Filter by severity"
          >
            <option value="all">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          {/* Date segment */}
          <div
            className="flex overflow-hidden rounded-[var(--radius-sm)] border"
            style={{ borderColor: 'var(--color-border)' }}
            role="group"
            aria-label="Date range"
          >
            {DATE_OPTIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDateFilter(d.id)}
                className="px-2.5 py-2 text-xs font-medium transition-colors"
                style={{
                  background: dateFilter === d.id ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: dateFilter === d.id ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active filter pills + count */}
        {(activePills.length > 0 || debouncedSearch) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            {activePills.map((p) => (
              <span
                key={p.label}
                className="flex items-center gap-1 rounded-full px-2 py-1"
                style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {p.label}
                <button onClick={p.clear} aria-label={`Remove ${p.label} filter`}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <button onClick={clearAll} className="hover:underline" style={{ color: 'var(--color-text-muted)' }}>
              Clear all
            </button>
            <span className="ml-auto tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {filteredLogs.length} of {auditLogs.length} events
            </span>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card padded={false} className="overflow-hidden">
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<Calendar size={18} />}
            title="No events match these filters"
            description="Widen the date range or clear a filter to see more."
            action={
              <button onClick={clearAll} className="text-sm font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="admin-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['When', 'Actor', 'Entity', 'Action', 'Severity', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {filteredLogs.map((log) => {
                  const sev = getSeverity(log.Action);
                  return (
                    <tr
                      key={log.LogID}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <td className="whitespace-nowrap px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                        <TimeAgo iso={log.ActionDateTime} />
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3" style={{ color: 'var(--color-text)' }}>
                        {log.ActionByEmail}
                      </td>
                      <td className="px-4 py-3">
                        <span style={{ color: 'var(--color-text)' }}>{log.EntityType}</span>{' '}
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {log.EntityID}
                        </span>
                      </td>
                      <td className="max-w-[280px] truncate px-4 py-3" style={{ color: 'var(--color-text)' }}>
                        {log.Action}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={SEVERITY_BADGE[sev].variant} dot>
                          {SEVERITY_BADGE[sev].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={15} style={{ color: 'var(--color-text-muted)' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail drawer */}
      <Drawer isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} size="md" position="right">
        {selectedLog && (
          <div className="admin-root flex h-full flex-col">
            <div className="admin-scroll flex-1 space-y-6 overflow-y-auto p-6">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  {getSeverity(selectedLog.Action) === 'error' ? (
                    <AlertCircle size={16} style={{ color: 'var(--color-danger)' }} />
                  ) : getSeverity(selectedLog.Action) === 'warning' ? (
                    <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
                  ) : (
                    <Info size={16} style={{ color: 'var(--color-accent)' }} />
                  )}
                  <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                    {selectedLog.Action}
                  </h2>
                </div>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {selectedLog.EntityType} · {selectedLog.EntityID} ·{' '}
                  {new Date(selectedLog.ActionDateTime).toLocaleString()}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  by {selectedLog.ActionByEmail}
                </p>
              </div>

              {selectedLog.OldValueJSON && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    Before
                  </h3>
                  <pre
                    className="admin-scroll overflow-x-auto rounded-[var(--radius-md)] p-3 text-xs"
                    style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
                  >
                    {selectedLog.OldValueJSON}
                  </pre>
                </div>
              )}

              {selectedLog.NewValueJSON && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    After
                  </h3>
                  <pre
                    className="admin-scroll overflow-x-auto rounded-[var(--radius-md)] p-3 text-xs"
                    style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
                  >
                    {selectedLog.NewValueJSON}
                  </pre>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  Metadata
                </h3>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['Log ID', selectedLog.LogID],
                    ['Entity type', selectedLog.EntityType],
                    ['Entity ID', selectedLog.EntityID],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt style={{ color: 'var(--color-text-muted)' }}>{k}</dt>
                      <dd className="text-right" style={{ color: 'var(--color-text)' }}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}