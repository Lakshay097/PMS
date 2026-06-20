import React, { useState } from 'react';
import FormField from '../../shared/FormField';
import { Save, AlertTriangle, Clock, Shield, Bell, Calendar, Server, CheckCircle } from 'lucide-react';

interface Setting {
  key: string;
  name: string;
  description: string;
  value: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
  category: string;
  risky?: boolean;
  lastChanged?: string;
}

interface GlobalSettingsProps {
  onBack?: () => void;
}

export default function GlobalSettings({ onBack }: GlobalSettingsProps) {
  const [activeCategory, setActiveCategory] = useState('task-rules');
  const [settings, setSettings] = useState<Setting[]>([
    {
      key: 'task_default_priority',
      name: 'Default Task Priority',
      description: 'The priority level assigned to new tasks by default',
      value: 'Medium',
      type: 'select',
      options: ['Low', 'Medium', 'High', 'Critical'],
      category: 'task-rules',
      lastChanged: '2024-01-15',
    },
    {
      key: 'task_auto_close_days',
      name: 'Auto-Close Completed Tasks',
      description: 'Number of days after completion before tasks are automatically archived',
      value: '30',
      type: 'number',
      category: 'task-rules',
      lastChanged: '2024-01-10',
    },
    {
      key: 'task_require_description',
      name: 'Require Task Description',
      description: 'Whether task description is mandatory when creating tasks',
      value: 'true',
      type: 'boolean',
      category: 'task-rules',
      lastChanged: '2024-01-05',
    },
    {
      key: 'scheduler_enabled',
      name: 'Enable Scheduler',
      description: 'Master switch for the recurring task generation system',
      value: 'true',
      type: 'boolean',
      category: 'scheduler',
      risky: true,
      lastChanged: '2024-01-20',
    },
    {
      key: 'scheduler_timezone',
      name: 'Scheduler Timezone',
      description: 'Timezone used for scheduling recurring task generation',
      value: 'UTC',
      type: 'select',
      options: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'],
      category: 'scheduler',
      lastChanged: '2024-01-18',
    },
    {
      key: 'scheduler_retry_attempts',
      name: 'Retry Failed Runs',
      description: 'Number of retry attempts for failed scheduler runs',
      value: '3',
      type: 'number',
      category: 'scheduler',
      lastChanged: '2024-01-12',
    },
    {
      key: 'email_enabled',
      name: 'Enable Email Notifications',
      description: 'Master switch for all email notifications',
      value: 'true',
      type: 'boolean',
      category: 'notifications',
      lastChanged: '2024-01-22',
    },
    {
      key: 'email_overdue_alert',
      name: 'Overdue Task Alerts',
      description: 'Send email alerts when tasks become overdue',
      value: 'true',
      type: 'boolean',
      category: 'notifications',
      lastChanged: '2024-01-15',
    },
    {
      key: 'email_digest_frequency',
      name: 'Digest Email Frequency',
      description: 'How often to send digest emails to users',
      value: 'daily',
      type: 'select',
      options: ['daily', 'weekly', 'never'],
      category: 'notifications',
      lastChanged: '2024-01-08',
    },
    {
      key: 'auth_session_timeout',
      name: 'Session Timeout',
      description: 'Minutes of inactivity before user session expires',
      value: '60',
      type: 'number',
      category: 'security',
      lastChanged: '2024-01-25',
    },
    {
      key: 'auth_2fa_required',
      name: 'Require Two-Factor Authentication',
      description: 'Enforce 2FA for all user accounts',
      value: 'false',
      type: 'boolean',
      category: 'security',
      risky: true,
      lastChanged: '2024-01-20',
    },
    {
      key: 'auth_password_min_length',
      name: 'Minimum Password Length',
      description: 'Minimum number of characters required for passwords',
      value: '8',
      type: 'number',
      category: 'security',
      lastChanged: '2024-01-10',
    },
    {
      key: 'env_mode',
      name: 'Environment Mode',
      description: 'Current deployment environment',
      value: 'production',
      type: 'select',
      options: ['development', 'staging', 'production'],
      category: 'environment',
      risky: true,
      lastChanged: '2024-01-01',
    },
    {
      key: 'env_maintenance_mode',
      name: 'Maintenance Mode',
      description: 'Disable the application for maintenance',
      value: 'false',
      type: 'boolean',
      category: 'environment',
      risky: true,
      lastChanged: '2024-01-28',
    },
  ]);

  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, string>>({});
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);

  const categories = [
    { id: 'task-rules', label: 'Task Rules', icon: <CheckCircle size={18} /> },
    { id: 'scheduler', label: 'Scheduler', icon: <Calendar size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'security', label: 'Security', icon: <Shield size={18} /> },
    { id: 'environment', label: 'Environment', icon: <Server size={18} /> },
  ];

  const filteredSettings = settings.filter(s => s.category === activeCategory);

  const handleSettingChange = (key: string, value: string) => {
    setUnsavedChanges({ ...unsavedChanges, [key]: value });
  };

  const handleSave = (key: string) => {
    const setting = settings.find(s => s.key === key);
    if (setting && unsavedChanges[key]) {
      setSettings(settings.map(s => 
        s.key === key 
          ? { ...s, value: unsavedChanges[key], lastChanged: new Date().toISOString().split('T')[0] }
          : s
      ));
      setUnsavedChanges({ ...unsavedChanges, [key]: '' });
    }
  };

  const handleSaveAll = () => {
    setSettings(settings.map(s => 
      unsavedChanges[s.key] 
        ? { ...s, value: unsavedChanges[s.key], lastChanged: new Date().toISOString().split('T')[0] }
        : s
    ));
    setUnsavedChanges({});
  };

  const handleRiskySettingChange = (key: string, value: string) => {
    setShowConfirmation(key);
  };

  const confirmRiskyChange = () => {
    if (showConfirmation) {
      handleSettingChange(showConfirmation, unsavedChanges[showConfirmation] || settings.find(s => s.key === showConfirmation)?.value || '');
      setShowConfirmation(null);
    }
  };

  const hasUnsavedChanges = Object.keys(unsavedChanges).some(key => unsavedChanges[key]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-sm text-[var(--color-accent)] hover:underline"
              >
                ← Admin
              </button>
            )}
            <h1 className="text-xl font-semibold text-[#0f172a]">Global Settings</h1>
          </div>
          <p className="text-sm text-muted mt-1">Configure system parameters and business rules</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left Category Rail */}
        <div className="w-56 flex-shrink-0">
          <nav className="space-y-1">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                  activeCategory === category.id
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[#0f172a] hover:bg-gray-100'
                }`}
              >
                {category.icon}
                <span>{category.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main Settings Panel */}
        <div className="flex-1 space-y-6">
          {filteredSettings.map((setting) => (
            <div key={setting.key} className="bg-surface rounded-lg border border-[var(--color-border)] p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-semibold text-[#0f172a]">{setting.name}</h3>
                    {setting.risky && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                        <AlertTriangle size={12} />
                        <span>Risky</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted mb-4">{setting.description}</p>
                  
                  <FormField>
                    {setting.type === 'boolean' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={unsavedChanges[setting.key] !== undefined ? unsavedChanges[setting.key] === 'true' : setting.value === 'true'}
                          onChange={(e) => {
                            const newValue = e.target.checked.toString();
                            if (setting.risky) {
                              handleRiskySettingChange(setting.key, newValue);
                            } else {
                              handleSettingChange(setting.key, newValue);
                            }
                          }}
                          className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                        />
                        <span className="text-sm text-[#0f172a]">
                          {unsavedChanges[setting.key] !== undefined ? unsavedChanges[setting.key] === 'true' : setting.value === 'true' ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    ) : setting.type === 'select' && setting.options ? (
                      <select
                        value={unsavedChanges[setting.key] !== undefined ? unsavedChanges[setting.key] : setting.value}
                        onChange={(e) => {
                          if (setting.risky) {
                            handleRiskySettingChange(setting.key, e.target.value);
                          } else {
                            handleSettingChange(setting.key, e.target.value);
                          }
                        }}
                        className="w-full max-w-xs px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                      >
                        {setting.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={setting.type === 'number' ? 'number' : 'text'}
                        value={unsavedChanges[setting.key] !== undefined ? unsavedChanges[setting.key] : setting.value}
                        onChange={(e) => {
                          if (setting.risky) {
                            handleRiskySettingChange(setting.key, e.target.value);
                          } else {
                            handleSettingChange(setting.key, e.target.value);
                          }
                        }}
                        className="w-full max-w-xs px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                      />
                    )}
                  </FormField>

                  <div className="flex items-center gap-4 mt-4 text-xs text-muted">
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>Last changed: {setting.lastChanged}</span>
                    </div>
                    <a href="/admin/audit" className="text-[var(--color-accent)] hover:underline">
                      View audit
                    </a>
                  </div>
                </div>

                <button
                  onClick={() => handleSave(setting.key)}
                  disabled={!unsavedChanges[setting.key]}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Save size={16} />
                  <span>Save</span>
                </button>
              </div>
            </div>
          ))}

          {/* Sticky Save Summary */}
          {hasUnsavedChanges && (
            <div className="sticky bottom-6 bg-surface rounded-lg border border-[var(--color-border)] p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[#0f172a]">Unsaved changes</div>
                  <div className="text-xs text-muted">
                    {Object.keys(unsavedChanges).filter(key => unsavedChanges[key]).length} settings modified
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUnsavedChanges({})}
                    className="px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveAll}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                  >
                    <Save size={16} />
                    <span>Save all</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-[#0f172a]">Confirm Risky Change</h3>
            </div>
            <p className="text-sm text-muted mb-6">
              This setting is marked as risky and may affect system behavior. Are you sure you want to change it?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowConfirmation(null)}
                className="px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRiskyChange}
                className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Confirm change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
