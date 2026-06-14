import React from 'react';
import KPICard from '../shared/KPICard';
import { Users, Calendar, Mail, FileText, Settings, Activity, ChevronRight, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface AdminHomeProps {
  onNavigateToModule?: (module: string) => void;
}

export default function AdminHome({ onNavigateToModule }: AdminHomeProps) {
  const modules = [
    {
      id: 'identities',
      label: 'Identity directory',
      description: 'Manage users, roles, and access permissions',
      icon: <Users size={24} />,
      health: 'healthy',
      healthLabel: 'All systems operational',
    },
    {
      id: 'blueprints',
      label: 'Recurrence blueprints',
      description: 'Configure automated task generation schedules',
      icon: <Calendar size={24} />,
      health: 'healthy',
      healthLabel: '12 active blueprints',
    },
    {
      id: 'templates',
      label: 'Email templates',
      description: 'Customize notification and alert templates',
      icon: <Mail size={24} />,
      health: 'healthy',
      healthLabel: '5 templates configured',
    },
    {
      id: 'audit',
      label: 'Audit ledger',
      description: 'View system events and change history',
      icon: <FileText size={24} />,
      health: 'healthy',
      healthLabel: 'Logging active',
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

  const recentSystemEvents = [
    { id: 1, message: 'Scheduler cycle completed successfully', time: '10 minutes ago', type: 'success' },
    { id: 2, message: 'User john@example.com logged in', time: '25 minutes ago', type: 'info' },
    { id: 3, message: 'Task #12345 marked as overdue', time: '1 hour ago', type: 'warning' },
    { id: 4, message: 'Email notification sent to team@example.com', time: '2 hours ago', type: 'info' },
  ];

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
          value="24"
          note="Users with active access"
        />
        <KPICard
          label="Active schedulers"
          value="12"
          note="Recurring task generators"
        />
        <KPICard
          label="Alert dispatches today"
          value="8"
          note="Email notifications sent"
        />
        <KPICard
          label="Audit exceptions"
          value="0"
          note="System anomalies detected"
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
