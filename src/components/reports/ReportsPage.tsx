import React, { useState } from 'react';
import TimelineItem from '../shared/TimelineItem';
import FilterChip from '../shared/FilterChip';
import { Calendar, Filter as FilterIcon, ChevronDown, CheckSquare, Clock, AlertTriangle, FileText, Calendar as CalendarIcon } from 'lucide-react';
import { AuditLog } from '../../types';

interface ReportsPageProps {
  auditLogs: AuditLog[];
}

export default function ReportsPage({ auditLogs }: ReportsPageProps) {
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  // Get unique actors
  {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
  const actors = Array.from(new Set(auditLogs.map(log => log.ActionByEmail)));

  // Get unique event types
  const eventTypes = Array.from(new Set(auditLogs.map(log => log.Action)));

  // Filter logs
  const filteredLogs = auditLogs.filter(log => {
    if (actorFilter !== 'all' && log.ActionByEmail !== actorFilter) return false;
    if (eventTypeFilter !== 'all' && log.Action !== eventTypeFilter) return false;
    
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
    
    return true;
  });

  // Group by date
  const groupedLogs = filteredLogs.reduce((acc, log) => {
    const date = new Date(log.ActionDateTime).toLocaleDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, AuditLog[]>);

  // Get icon for entity type
  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'Task':
        return <CheckSquare size={14} />;
      case 'Report':
        return <FileText size={14} />;
      case 'Template':
        return <CalendarIcon size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  // Get status for event type
  const getEventStatus = (action: string) => {
    if (action.includes('delete') || action.includes('failed')) return 'danger';
    if (action.includes('update') || action.includes('edit')) return 'warning';
    if (action.includes('create') || action.includes('complete')) return 'success';
    return 'default';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">Reports & Activity</h1>
          <p className="text-sm text-muted mt-1">Chronological activity feed</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <FilterIcon size={16} className="text-muted" />
          <span className="text-sm font-medium text-[#0f172a]">Filters</span>
        </div>

        {/* Date Filter */}
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

        {/* Actor Filter */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All actors"
            active={actorFilter === 'all'}
            onClick={() => setActorFilter('all')}
          />
          {actors.filter(actor => actor).map(actor => (
            <div key={actor}>
              <FilterChip
                label={actor}
                active={actorFilter === actor}
                onClick={() => setActorFilter(actor)}
              />
            </div>
          ))}
        </div>

        {/* Event Type Filter */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All events"
            active={eventTypeFilter === 'all'}
            onClick={() => setEventTypeFilter('all')}
          />
          {eventTypes.slice(0, 5).filter(type => type).map(type => (
            <div key={type}>
              <FilterChip
                label={type}
                active={eventTypeFilter === type}
                onClick={() => setEventTypeFilter(type)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)]">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={48} className="text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">No activity found matching your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {Object.entries(groupedLogs)
              .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
              .map(([date, logs]) => (
                <div key={date}>
                  <div className="px-6 py-3 bg-gray-50 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-muted" />
                      <span className="text-sm font-medium text-[#0f172a]">{date}</span>
                      <span className="text-xs text-muted">({logs.length} events)</span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="space-y-0">
                      {logs
                        .sort((a, b) => new Date(b.ActionDateTime).getTime() - new Date(a.ActionDateTime).getTime())
                        .map((log) => (
                          <div key={log.LogID}>
                            <TimelineItem
                              title={log.Action}
                              timestamp={new Date(log.ActionDateTime).toLocaleTimeString()}
                              actor={log.ActionByEmail}
                              icon={getEntityIcon(log.EntityType)}
                              status={getEventStatus(log.Action) as any}
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
          <div className="text-sm text-muted mb-1">Total events</div>
          <div className="text-2xl font-semibold text-[#0f172a]">{filteredLogs.length}</div>
        </div>
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
          <div className="text-sm text-muted mb-1">Unique actors</div>
          <div className="text-2xl font-semibold text-[#0f172a]">{actors.length}</div>
        </div>
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
          <div className="text-sm text-muted mb-1">Event types</div>
          <div className="text-2xl font-semibold text-[#0f172a]">{eventTypes.length}</div>
        </div>
      </div>
    </div>
  );
}
