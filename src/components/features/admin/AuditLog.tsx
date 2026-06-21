import React, { useState } from 'react';
import Drawer from '../../shared/Drawer';
import FilterChip from '../../shared/FilterChip';
import { Search, Download, Calendar, Filter as FilterIcon, ChevronRight, AlertTriangle, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { AuditLog } from '../../../types/index';

interface AuditLogProps {
  auditLogs: AuditLog[];
  onExport?: () => void;
}

export default function AuditLogPage({ auditLogs, onExport }: AuditLogProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all');

  // Get unique values
  {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
  const actors = Array.from(new Set(auditLogs.map(log => log.ActionByEmail)));
  const entities = Array.from(new Set(auditLogs.map(log => log.EntityType)));
  const actions = Array.from(new Set(auditLogs.map(log => log.Action)));

  // Filter logs
  const filteredLogs = auditLogs.filter(log => {
    if (searchQuery && !log.Action.toLowerCase().includes(searchQuery.toLowerCase()) && !log.EntityID.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (actorFilter !== 'all' && log.ActionByEmail !== actorFilter) return false;
    if (entityFilter !== 'all' && log.EntityType !== entityFilter) return false;
    if (actionFilter !== 'all' && log.Action !== actionFilter) return false;
    
    if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      return log.ActionDateTime.startsWith(today);
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(log.ActionDateTime) > weekAgo;
    }
    if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return new Date(log.ActionDateTime) > monthAgo;
    }
    
    // Simple severity detection based on action
    const actionLower = log.Action.toLowerCase();
    const severity = actionLower.includes('error') || actionLower.includes('failed') || actionLower.includes('delete') ? 'error' :
                      actionLower.includes('warning') || actionLower.includes('overdue') ? 'warning' : 'info';
    if (severityFilter !== 'all' && severity !== severityFilter) return false;
    
    return true;
  });

  const getSeverity = (action: string): 'info' | 'warning' | 'error' => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('error') || actionLower.includes('failed') || actionLower.includes('delete')) return 'error';
    if (actionLower.includes('warning') || actionLower.includes('overdue')) return 'warning';
    return 'info';
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={14} className="text-[var(--color-danger)]" />;
      case 'warning':
        return <AlertTriangle size={14} className="text-[var(--color-warning)]" />;
      default:
        return <Info size={14} className="text-[var(--color-accent)]" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'error':
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Error</span>;
      case 'warning':
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Warning</span>;
      default:
        return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Info</span>;
    }
  };

  const handleLogClick = (log: AuditLog) => {
    setSelectedLog(log);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDateFilter('all');
    setActorFilter('all');
    setEntityFilter('all');
    setActionFilter('all');
    setSeverityFilter('all');
  };

  const hasActiveFilters = searchQuery || dateFilter !== 'all' || actorFilter !== 'all' || entityFilter !== 'all' || actionFilter !== 'all' || severityFilter !== 'all';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">Audit Log</h1>
          <p className="text-sm text-muted mt-1">System events and change history</p>
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
          >
            <Download size={16} />
            <span>Export</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <FilterIcon size={16} className="text-muted" />
          <span className="text-sm font-medium text-[#0f172a]">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-[var(--color-accent)] hover:underline ml-auto"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by action or entity ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
          />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All time"
            active={dateFilter === 'all'}
            onClick={() => setDateFilter('all')}
          />
          <FilterChip
            label="Today"
            active={dateFilter === 'today'}
            onClick={() => setDateFilter('today')}
          />
          <FilterChip
            label="This week"
            active={dateFilter === 'week'}
            onClick={() => setDateFilter('week')}
          />
          <FilterChip
            label="This month"
            active={dateFilter === 'month'}
            onClick={() => setDateFilter('month')}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All actors"
            active={actorFilter === 'all'}
            onClick={() => setActorFilter('all')}
          />
          {actors.slice(0, 5).map(actor => (
            <div key={actor}>
              <FilterChip
                label={actor}
                active={actorFilter === actor}
                onClick={() => setActorFilter(actor)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All entities"
            active={entityFilter === 'all'}
            onClick={() => setEntityFilter('all')}
          />
          {entities.slice(0, 5).map(entity => (
            <div key={entity}>
              <FilterChip
                label={entity}
                active={entityFilter === entity}
                onClick={() => setEntityFilter(entity)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All severities"
            active={severityFilter === 'all'}
            onClick={() => setSeverityFilter('all')}
          />
          <FilterChip
            label="Info"
            active={severityFilter === 'info'}
            onClick={() => setSeverityFilter('info')}
          />
          <FilterChip
            label="Warning"
            active={severityFilter === 'warning'}
            onClick={() => setSeverityFilter('warning')}
          />
          <FilterChip
            label="Error"
            active={severityFilter === 'error'}
            onClick={() => setSeverityFilter('error')}
          />
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)] overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar size={48} className="text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">No audit logs found matching your filters</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-sm text-[var(--color-accent)] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Summary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.LogID}
                    onClick={() => handleLogClick(log)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm text-[#0f172a]">
                        {new Date(log.ActionDateTime).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[#0f172a]">{log.ActionByEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[#0f172a]">{log.EntityType}</div>
                      <div className="text-xs text-muted">{log.EntityID}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[#0f172a]">{log.Action}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-muted max-w-xs truncate">
                        {log.Action} on {log.EntityType} {log.EntityID}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getSeverityBadge(getSeverity(log.Action))}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-1 hover:bg-gray-200 rounded transition-colors">
                        <ChevronRight size={16} className="text-muted" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Side Sheet */}
      <Drawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        size="md"
        position="right"
      >
        {selectedLog && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Event Summary */}
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Event Summary</h3>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {getSeverityIcon(getSeverity(selectedLog.Action))}
                    <span className="text-sm font-medium text-[#0f172a]">{selectedLog.Action}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {selectedLog.Action} on {selectedLog.EntityType} ({selectedLog.EntityID})
                  </div>
                </div>
              </div>

              {/* Timestamp */}
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Timestamp</h3>
                <div className="text-sm text-[#0f172a]">
                  {new Date(selectedLog.ActionDateTime).toLocaleString()}
                </div>
              </div>

              {/* Actor */}
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Actor</h3>
                <div className="text-sm text-[#0f172a]">{selectedLog.ActionByEmail}</div>
              </div>

              {/* Old Value */}
              {selectedLog.OldValueJSON && (
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-3">Old Value</h3>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <pre className="text-xs text-red-800 whitespace-pre-wrap overflow-x-auto">
                      {selectedLog.OldValueJSON}
                    </pre>
                  </div>
                </div>
              )}

              {/* New Value */}
              {selectedLog.NewValueJSON && (
                <div>
                  <h3 className="text-sm font-medium text-[#0f172a] mb-3">New Value</h3>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <pre className="text-xs text-green-800 whitespace-pre-wrap overflow-x-auto">
                      {selectedLog.NewValueJSON}
                    </pre>
                  </div>
                </div>
              )}

              {/* Technical Metadata */}
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Technical Metadata</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Log ID:</span>
                    <span className="text-[#0f172a]">{selectedLog.LogID}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Entity Type:</span>
                    <span className="text-[#0f172a]">{selectedLog.EntityType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Entity ID:</span>
                    <span className="text-[#0f172a]">{selectedLog.EntityID}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
