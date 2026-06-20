import React from 'react';
import KPICard from '../../shared/KPICard';
import { Users, Calendar, Mail, FileText, Settings, Activity, ChevronRight, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface AdminHomeProps {
  onNavigateToModule?: (module: string) => void;
  users?: any[];
  templates?: any[];
  audits?: any[];
  tasks?: any[];
}

export default function AdminHome({ onNavigateToModule, users = [], templates = [], audits = [], tasks = [] }: AdminHomeProps) {
  const activeUsersCount = users.filter(u => u.Active).length;
  const activeTemplatesCount = templates.filter(t => t.Active).length;
  const today = new Date().toISOString().split('T')[0];
  const overdueTasksCount = tasks.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate < today;
  }).length;

  const modules = [
    {
      id: 'identities',
      label: 'Identity directory',
      description: 'Manage users, roles, and access permissions',
      icon: <Users size={24} />,
      health: 'healthy',
      healthLabel: `${activeUsersCount} active users`,
    },
    {
      id: 'blueprints',
      label: 'Recurrence blueprints',
      description: 'Configure automated task generation schedules',
      icon: <Calendar size={24} />,
      health: activeTemplatesCount > 0 ? 'healthy' : 'warning',
      healthLabel: `${activeTemplatesCount} active blueprints`,
    },
    {
      id: 'templates',
      label: 'Email templates',
      description: 'Customize notification and alert templates',
      icon: <Mail size={24} />,
      health: 'healthy',
      healthLabel: 'Templates configured',
    },
    {
      id: 'audit',
      label: 'Audit ledger',
      description: 'View system events and change history',
      icon: <FileText size={24} />,
      health: 'healthy',
      healthLabel: `${audits.length} records logged`,
    },
    {
      id: 'settings',
      label: 'Global settings',
      description: 'Configure system parameters and business rules',
      icon: <Settings size={24} />,
      health: 'healthy',
      healthLabel: 'Configuration current',
    },
  ];

  const recentSystemEvents = audits.slice(0, 4).map((audit, index) => ({
    id: audit.AuditID || index,
    message: audit.Action || 'System event recorded',
    time: audit.Timestamp ? new Date(audit.Timestamp).toLocaleString() : 'Recently',
    type: audit.Action?.toLowerCase().includes('error') ? 'warning' : 'info',
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#0f172a]">Admin Console</h1>
        <p className="text-sm text-muted mt-1">System operations and configuration</p>
      </div>

      {/* Admin KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Active identities"
          value={activeUsersCount.toString()}
          note="Users with active access"
        />
        <KPICard
          label="Active schedulers"
          value={activeTemplatesCount.toString()}
          note="Recurring task generators"
        />
        <KPICard
          label="Overdue tasks"
          value={overdueTasksCount.toString()}
          note="Tasks requiring attention"
        />
        <KPICard
          label="Audit records"
          value={audits.length.toString()}
          note="System events logged"
        />
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="text-lg font-semibold text-[#0f172a] mb-4">System Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((module) => (
            <button
              key={module.id}
              onClick={() => onNavigateToModule?.(module.id)}
              className="bg-surface rounded-lg border border-[var(--color-border)] p-6 hover:shadow-md transition-shadow text-left group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-lg text-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-white transition-colors">
                  {module.icon}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${module.health === 'healthy' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'}`} />
                  <span className="text-xs text-muted">{module.healthLabel}</span>
                </div>
              </div>
              <h3 className="text-base font-semibold text-[#0f172a] mb-1">{module.label}</h3>
              <p className="text-sm text-muted mb-4">{module.description}</p>
              <div className="flex items-center gap-1 text-sm text-[var(--color-accent)] group-hover:underline">
                <span>Open module</span>
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* System Activity Preview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#0f172a]">System Activity</h2>
          <button
            onClick={() => onNavigateToModule?.('audit')}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Open audit log →
          </button>
        </div>
        <div className="bg-surface rounded-lg border border-[var(--color-border)]">
          <div className="divide-y divide-[var(--color-border)]">
            {recentSystemEvents.map((event) => (
              <div key={event.id} className="p-4 flex items-start gap-3">
                <div className={`p-2 rounded-full ${
                  event.type === 'success' ? 'bg-green-100 text-[var(--color-success)]' :
                  event.type === 'warning' ? 'bg-amber-100 text-[var(--color-warning)]' :
                  'bg-blue-100 text-[var(--color-accent)]'
                }`}>
                  {event.type === 'success' && <CheckCircle size={16} />}
                  {event.type === 'warning' && <AlertCircle size={16} />}
                  {event.type === 'info' && <Clock size={16} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[#0f172a]">{event.message}</p>
                  <p className="text-xs text-muted mt-1">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-surface rounded-lg border border-[var(--color-border)] p-4 hover:bg-gray-50 transition-colors text-left">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={20} className="text-[var(--color-accent)]" />
              <span className="text-sm font-medium text-[#0f172a]">Run scheduler cycle</span>
            </div>
            <p className="text-xs text-muted">Manually trigger recurring task generation</p>
          </button>
          <button className="bg-surface rounded-lg border border-[var(--color-border)] p-4 hover:bg-gray-50 transition-colors text-left">
            <div className="flex items-center gap-2 mb-2">
              <Mail size={20} className="text-[var(--color-accent)]" />
              <span className="text-sm font-medium text-[#0f172a]">Send test notification</span>
            </div>
            <p className="text-xs text-muted">Verify email notification system</p>
          </button>
          <button className="bg-surface rounded-lg border border-[var(--color-border)] p-4 hover:bg-gray-50 transition-colors text-left">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={20} className="text-[var(--color-accent)]" />
              <span className="text-sm font-medium text-[#0f172a]">Export audit log</span>
            </div>
            <p className="text-xs text-muted">Download system event history</p>
          </button>
        </div>
      </div>
    </div>
  );
}
