import React, { useState } from 'react';
import { Save, AlertTriangle, Shield, Bell, Calendar, Server, CheckCircle, RotateCcw } from 'lucide-react';
import { Badge, Card, Switch } from '../../shared/ui';

/**
 * Global Settings — redesigned.
 *
 * What changed vs. the previous version:
 *  - Booleans use a proper Switch instead of a 16px checkbox (a master
 *    "Enable Scheduler" kill-switch deserves a deliberate control)
 *  - Settings render as compact rows inside one card per category, instead
 *    of one full-width card + Save button per setting; modified rows get an
 *    accent bar and a "Modified" badge so dirty state is visible at a glance
 *  - One save model: the sticky bar saves everything; the per-setting Save
 *    button forest is gone
 *  - The risky-change confirmation names the setting and shows old → new
 *    values instead of a generic "are you sure"
 *  - Category rail shows a dot on categories with unsaved changes
 *
 * NOTE: this component still ships with the local defaults the original had.
 * To actually persist, pass `onUpdateSetting` (and initial values via
 * `initialValues`) from AdminPage — handleSaveAll calls it per changed key.
 */

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
  initialValues?: Record<string, string>;
  onUpdateSetting?: (key: string, value: string) => Promise<void> | void;
}

const DEFAULT_SETTINGS: Setting[] = [
  { key: 'task_default_priority', name: 'Default task priority', description: 'Priority assigned to new tasks (default single value)', value: 'Medium', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'], category: 'task-rules', lastChanged: '2024-01-15' },
  { key: 'task_auto_close_days', name: 'Auto-archive completed tasks', description: 'Days after completion before tasks are archived', value: '30', type: 'number', category: 'task-rules', lastChanged: '2024-01-10' },
  { key: 'task_require_description', name: 'Require task description', description: 'Make the description field mandatory', value: 'true', type: 'boolean', category: 'task-rules', lastChanged: '2024-01-05' },
  { key: 'scheduler_enabled', name: 'Enable scheduler', description: 'Master switch for recurring task generation', value: 'true', type: 'boolean', category: 'scheduler', risky: true, lastChanged: '2024-01-20' },
  { key: 'scheduler_timezone', name: 'Scheduler timezone', description: 'Timezone used to schedule generation runs', value: 'UTC', type: 'select', options: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Kolkata'], category: 'scheduler', lastChanged: '2024-01-18' },
  { key: 'scheduler_retry_attempts', name: 'Retry failed runs', description: 'Retry attempts for failed scheduler runs', value: '3', type: 'number', category: 'scheduler', lastChanged: '2024-01-12' },
  { key: 'email_enabled', name: 'Enable email notifications', description: 'Master switch for all outgoing email', value: 'true', type: 'boolean', category: 'notifications', lastChanged: '2024-01-22' },
  { key: 'email_overdue_alert', name: 'Overdue task alerts', description: 'Email users when their tasks become overdue', value: 'true', type: 'boolean', category: 'notifications', lastChanged: '2024-01-15' },
  { key: 'email_digest_frequency', name: 'Digest frequency', description: 'How often digest emails are sent', value: 'daily', type: 'select', options: ['daily', 'weekly', 'never'], category: 'notifications', lastChanged: '2024-01-08' },
  { key: 'auth_session_timeout', name: 'Session timeout (minutes)', description: 'Inactivity before a session expires', value: '60', type: 'number', category: 'security', lastChanged: '2024-01-25' },
  { key: 'auth_2fa_required', name: 'Require two-factor authentication', description: 'Enforce 2FA for every account', value: 'false', type: 'boolean', category: 'security', risky: true, lastChanged: '2024-01-20' },
  { key: 'auth_password_min_length', name: 'Minimum password length', description: 'Characters required for passwords', value: '8', type: 'number', category: 'security', lastChanged: '2024-01-10' },
  { key: 'env_mode', name: 'Environment mode', description: 'Current deployment environment', value: 'production', type: 'select', options: ['development', 'staging', 'production'], category: 'environment', risky: true, lastChanged: '2024-01-01' },
  { key: 'env_maintenance_mode', name: 'Maintenance mode', description: 'Take the application offline for maintenance', value: 'false', type: 'boolean', category: 'environment', risky: true, lastChanged: '2024-01-28' },
];

const CATEGORIES = [
  { id: 'task-rules', label: 'Task rules', icon: <CheckCircle size={16} /> },
  { id: 'scheduler', label: 'Scheduler', icon: <Calendar size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'environment', label: 'Environment', icon: <Server size={16} /> },
];

export default function GlobalSettings({ onBack, initialValues, onUpdateSetting }: GlobalSettingsProps) {
  const [activeCategory, setActiveCategory] = useState('task-rules');
  const [settings, setSettings] = useState<Setting[]>(() =>
    DEFAULT_SETTINGS.map((s) => ({ ...s, value: initialValues?.[s.key] ?? s.value }))
  );
  const [pending, setPending] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<{ key: string; value: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentValue = (s: Setting) => pending[s.key] ?? s.value;
  const isDirty = (s: Setting) => pending[s.key] !== undefined && pending[s.key] !== s.value;
  const dirtyKeys = Object.keys(pending).filter((k) => {
    const s = settings.find((x) => x.key === k);
    return s && pending[k] !== s.value;
  });
  const dirtyByCategory = (cat: string) =>
    dirtyKeys.some((k) => settings.find((s) => s.key === k)?.category === cat);

  const stage = (setting: Setting, value: string) => {
    if (setting.risky && value !== setting.value) {
      setConfirming({ key: setting.key, value });
    } else {
      setPending((p) => ({ ...p, [setting.key]: value }));
    }
  };

  const confirmRisky = () => {
    if (confirming) setPending((p) => ({ ...p, [confirming.key]: confirming.value }));
    setConfirming(null);
  };

  const revert = (key: string) =>
    setPending((p) => {
      const { [key]: _, ...rest } = p;
      return rest;
    });

  const saveAll = async () => {
    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      for (const key of dirtyKeys) {
        await onUpdateSetting?.(key, pending[key]);
      }
      setSettings((all) =>
        all.map((s) => (dirtyKeys.includes(s.key) ? { ...s, value: pending[s.key], lastChanged: today } : s))
      );
      setPending({});
    } finally {
      setIsSaving(false);
    }
  };

  const visible = settings.filter((s) => s.category === activeCategory);
  const confirmingSetting = confirming ? settings.find((s) => s.key === confirming.key) : null;

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
  };

  return (
    <div className="admin-root p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>
              ← Admin
            </button>
          )}
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Global Settings
          </h1>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          System parameters and business rules
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Category rail with dirty dots */}
        <nav className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col" aria-label="Setting categories">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="flex items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm font-medium transition-colors"
                style={{
                  background: active ? 'var(--color-accent-soft)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                {cat.icon}
                <span className="flex-1 text-left">{cat.label}</span>
                {dirtyByCategory(cat.id) && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-warning)' }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Settings rows */}
        <div className="flex-1 space-y-4">
          <Card padded={false}>
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {visible.map((setting) => {
                const dirty = isDirty(setting);
                const value = currentValue(setting);
                return (
                  <li
                    key={setting.key}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6"
                    style={{ boxShadow: dirty ? 'inset 3px 0 0 var(--color-accent)' : 'none' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                          {setting.name}
                        </span>
                        {setting.risky && (
                          <Badge variant="warning" dot>Risky</Badge>
                        )}
                        {dirty && <Badge variant="accent">Modified</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {setting.description}
                        {setting.lastChanged && <> · Last changed {setting.lastChanged}</>}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {setting.type === 'boolean' ? (
                        <Switch
                          checked={value === 'true'}
                          onChange={(next) => stage(setting, String(next))}
                          label={setting.name}
                        />
                      ) : setting.type === 'select' && setting.options ? (
                        <select
                          value={value}
                          onChange={(e) => stage(setting, e.target.value)}
                          className="rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-sm"
                          style={inputStyle}
                        >
                          {setting.options.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={setting.type === 'number' ? 'number' : 'text'}
                          value={value}
                          onChange={(e) => stage(setting, e.target.value)}
                          className="w-28 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-sm text-right tabular-nums"
                          style={inputStyle}
                        />
                      )}
                      {dirty && (
                        <button
                          onClick={() => revert(setting.key)}
                          aria-label={`Revert ${setting.name}`}
                          title="Revert"
                          className="rounded p-1.5 transition-colors hover:bg-[var(--color-surface-2)]"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Sticky save bar — the single save model */}
          {dirtyKeys.length > 0 && (
            <div
              className="sticky bottom-4 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border p-3.5"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                <strong className="tabular-nums">{dirtyKeys.length}</strong>{' '}
                setting{dirtyKeys.length === 1 ? '' : 's'} modified
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPending({})}
                  disabled={isSaving}
                  className="rounded-[var(--radius-sm)] border px-3.5 py-2 text-sm font-medium disabled:opacity-50"
                  style={inputStyle}
                >
                  Discard
                </button>
                <button
                  onClick={saveAll}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <Save size={15} />
                  {isSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risky confirmation — names the change */}
      {confirming && confirmingSetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div
            className="w-full max-w-md rounded-[var(--radius-lg)] border p-6"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}
              >
                <AlertTriangle size={18} />
              </span>
              <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                Change “{confirmingSetting.name}”?
              </h3>
            </div>
            <p className="mb-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              This setting affects system-wide behavior.
            </p>
            <p className="mb-5 text-sm tabular-nums" style={{ color: 'var(--color-text)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{confirmingSetting.value}</span>
              {' → '}
              <strong>{confirming.value}</strong>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="rounded-[var(--radius-sm)] border px-3.5 py-2 text-sm font-medium"
                style={inputStyle}
              >
                Cancel
              </button>
              <button
                onClick={confirmRisky}
                className="rounded-[var(--radius-sm)] px-3.5 py-2 text-sm font-medium text-white"
                style={{ background: 'var(--color-warning)' }}
              >
                Apply change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}