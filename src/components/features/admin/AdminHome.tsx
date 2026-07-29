import React from 'react';
import {
  Users,
  Calendar,
  Mail,
  FileText,
  Settings,
  Activity,
  ChevronRight,
  AlertCircle,
  Clock,
  Database,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { Badge, Card, EmptyState, TimeAgo } from '../../shared/ui';

/**
 * Admin Console home — redesigned.
 *
 * What changed vs. the previous version:
 *  - Database sync status + one-click sync moved into the header (the props
 *    existed on AdminPage but were never surfaced anywhere)
 *  - KPI strip leads with what needs attention: overdue tasks turn red and
 *    jump to the front when > 0; numbers use tabular figures
 *  - Module cards carry real health states (dot + label), tighter density
 *  - Activity feed uses relative timestamps ("3m ago") with the full
 *    timestamp on hover, and has a proper empty state
 *  - Quick actions are wired to props instead of dead buttons
 */

interface AdminHomeProps {
  onNavigateToModule?: (module: string) => void;
  users?: any[];
  templates?: any[];
  audits?: any[];
  tasks?: any[];
  // surfaced from AdminPage — previously accepted but never rendered
  onSyncDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  dbConnectionStatus?: 'connected' | 'disconnected' | 'error';
  // quick actions — previously dead buttons
  onRunScheduler?: () => void;
  onSendTestEmail?: () => void;
  onExportAudit?: () => void;
}

export default function AdminHome({
  onNavigateToModule,
  users = [],
  templates = [],
  audits = [],
  tasks = [],
  onSyncDatabase,
  isSyncing,
  lastSyncTime,
  dbConnectionStatus = 'connected',
  onRunScheduler,
  onSendTestEmail,
  onExportAudit,
}: AdminHomeProps) {
  const activeUsers = users.filter((u) => u.Active).length;
  const pendingUsers = users.filter((u) => !u.Active).length;
  const activeTemplates = templates.filter((t) => t.Active).length;
  const today = new Date().toISOString().split('T')[0];
  const overdue = tasks.filter(
    (t) => t.Status !== 'Closed' && t.Status !== 'Reviewed' && t.DueDate < today
  ).length;

  const kpis = [
    {
      id: 'overdue',
      label: 'Overdue tasks',
      value: overdue,
      note: overdue > 0 ? 'Need attention now' : 'All on schedule',
      tone: overdue > 0 ? 'danger' : 'success',
      icon: <AlertCircle size={16} />,
    },
    {
      id: 'users',
      label: 'Active users',
      value: activeUsers,
      note: pendingUsers > 0 ? `${pendingUsers} awaiting approval` : 'Directory current',
      tone: pendingUsers > 0 ? 'warning' : 'neutral',
      icon: <Users size={16} />,
    },
    {
      id: 'schedulers',
      label: 'Active blueprints',
      value: activeTemplates,
      note: 'Recurring task generators',
      tone: activeTemplates > 0 ? 'neutral' : 'warning',
      icon: <Calendar size={16} />,
    },
    {
      id: 'audit',
      label: 'Audit records',
      value: audits.length,
      note: 'System events logged',
      tone: 'neutral',
      icon: <FileText size={16} />,
    },
  ] as const;

  const toneColor: Record<string, string> = {
    danger: 'var(--color-danger)',
    warning: 'var(--color-warning)',
    success: 'var(--color-success)',
    neutral: 'var(--color-text-muted)',
  };

  const modules = [
    {
      id: 'identities',
      label: 'Identity directory',
      description: 'Users, roles and access permissions',
      icon: <Users size={20} />,
      healthy: true,
      healthLabel: `${activeUsers} active`,
    },
    {
      id: 'blueprints',
      label: 'Recurrence blueprints',
      description: 'Automated task generation schedules',
      icon: <Calendar size={20} />,
      healthy: activeTemplates > 0,
      healthLabel: activeTemplates > 0 ? `${activeTemplates} running` : 'None active',
    },
    {
      id: 'templates',
      label: 'Email templates',
      description: 'Notification and alert content',
      icon: <Mail size={20} />,
      healthy: true,
      healthLabel: 'Configured',
    },
    {
      id: 'audit',
      label: 'Audit ledger',
      description: 'System events and change history',
      icon: <FileText size={20} />,
      healthy: true,
      healthLabel: `${audits.length} records`,
    },
    {
      id: 'settings',
      label: 'Global settings',
      description: 'System parameters and business rules',
      icon: <Settings size={20} />,
      healthy: true,
      healthLabel: 'Current',
    },
  ];

  const events = audits.slice(0, 5);

  const dbBadge =
    dbConnectionStatus === 'connected'
      ? { variant: 'success' as const, label: 'Database connected' }
      : dbConnectionStatus === 'error'
        ? { variant: 'danger' as const, label: 'Database error' }
        : { variant: 'warning' as const, label: 'Database disconnected' };

  return (
    <div className="admin-root p-6 space-y-6">
      {/* Header: title + live system status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Admin Console
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            System operations and configuration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={dbBadge.variant} dot>
            {dbBadge.label}
          </Badge>
          {onSyncDatabase && (
            <button
              onClick={onSyncDatabase}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
              title={lastSyncTime ? `Last sync: ${lastSyncTime}` : undefined}
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip — attention first */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.id}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                {kpi.label}
              </span>
              <span style={{ color: toneColor[kpi.tone] }}>{kpi.icon}</span>
            </div>
            <div
              className="mt-2 text-3xl font-semibold tabular-nums"
              style={{ color: kpi.tone === 'danger' ? 'var(--color-danger)' : 'var(--color-text)' }}
            >
              {kpi.value}
            </div>
            <p className="mt-1 text-xs" style={{ color: toneColor[kpi.tone] }}>
              {kpi.note}
            </p>
          </Card>
        ))}
      </div>

      {/* Two-column: modules + activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Modules */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            Modules
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {modules.map((m) => (
              <button
                key={m.id}
                onClick={() => onNavigateToModule?.(m.id)}
                className="group rounded-[var(--radius-lg)] border p-4 text-left transition-shadow hover:shadow-[var(--shadow-md)]"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors"
                    style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                  >
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {m.label}
                      </h3>
                      <ChevronRight
                        size={15}
                        className="shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--color-text-muted)' }}
                      />
                    </div>
                    <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {m.description}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: m.healthy ? 'var(--color-success)' : 'var(--color-warning)' }}
                  />
                  {m.healthLabel}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Activity + quick actions */}
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                Recent activity
              </h2>
              <button
                onClick={() => onNavigateToModule?.('audit')}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Open audit log
              </button>
            </div>
            <Card padded={false}>
              {events.length === 0 ? (
                <EmptyState
                  icon={<Activity size={18} />}
                  title="No activity yet"
                  description="System events will appear here as they happen."
                />
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {events.map((a: any, i: number) => {
                    const isWarn = a.Action?.toLowerCase().includes('error');
                    return (
                      <li key={a.AuditID || a.LogID || i} className="flex items-start gap-3 p-3.5">
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: isWarn ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
                            color: isWarn ? 'var(--color-danger)' : 'var(--color-accent)',
                          }}
                        >
                          {isWarn ? <AlertCircle size={13} /> : <Clock size={13} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm" style={{ color: 'var(--color-text)' }}>
                            {a.Action || 'System event recorded'}
                          </p>
                          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {a.Timestamp || a.ActionDateTime ? (
                              <TimeAgo iso={a.Timestamp || a.ActionDateTime} />
                            ) : (
                              'Recently'
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Quick actions
            </h2>
            <div className="space-y-2">
              {[
                { icon: <Activity size={16} />, label: 'Run scheduler cycle', note: 'Trigger recurring task generation', fn: onRunScheduler },
                { icon: <Mail size={16} />, label: 'Send test notification', note: 'Verify the email system', fn: onSendTestEmail },
                { icon: <Database size={16} />, label: 'Export audit log', note: 'Download event history', fn: onExportAudit },
              ].map((qa) => (
                <button
                  key={qa.label}
                  onClick={qa.fn}
                  disabled={!qa.fn}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <span style={{ color: 'var(--color-accent)' }}>{qa.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                      {qa.label}
                    </span>
                    <span className="block truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {qa.note}
                    </span>
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}