import React, { useState } from 'react';
import FormField from '../shared/FormField';
import { User, Lock, Bell, Sun, Moon, HelpCircle, Save, LogOut, Monitor, Smartphone } from 'lucide-react';

interface SettingsPageProps {
  user?: {
    name: string;
    email: string;
    role: string;
    team: string;
    manager?: string;
  };
  onLogout?: () => void;
}

export default function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState('profile');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    emailNotifications: true,
    deadlineReminders: true,
    updateSummaries: true,
    density: 'comfortable',
  });

  const sections = [
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'security', label: 'Password & Security', icon: <Lock size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'appearance', label: 'Appearance', icon: <Sun size={18} /> },
    { id: 'help', label: 'Help', icon: <HelpCircle size={18} /> },
  ];

  const handleSave = () => {
    console.log('Saving settings:', formData);
  };

  const handleLogout = () => {
    onLogout?.();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#0f172a]">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Left Settings Nav */}
        <div className="w-56 flex-shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[#0f172a] hover:bg-gray-100'
                }`}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium text-danger hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Right Panel - Form Area */}
        <div className="flex-1 bg-surface rounded-lg border border-[var(--color-border)] p-6">
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a] mb-1">Profile</h2>
                <p className="text-sm text-muted">Update your personal information</p>
              </div>

              <FormField label="Full Name">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
              </FormField>

              <FormField label="Email" helperText="Contact admin to change email address">
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full px-3 py-2 bg-gray-100 border border-[var(--color-border)] rounded-md text-sm text-muted cursor-not-allowed"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Role">
                  <input
                    type="text"
                    value={user?.role || ''}
                    disabled
                    className="w-full px-3 py-2 bg-gray-100 border border-[var(--color-border)] rounded-md text-sm text-muted cursor-not-allowed"
                  />
                </FormField>

                <FormField label="Team">
                  <input
                    type="text"
                    value={user?.team || ''}
                    disabled
                    className="w-full px-3 py-2 bg-gray-100 border border-[var(--color-border)] rounded-md text-sm text-muted cursor-not-allowed"
                  />
                </FormField>
              </div>

              <FormField label="Reports to">
                <input
                  type="text"
                  value={user?.manager || 'None'}
                  disabled
                  className="w-full px-3 py-2 bg-gray-100 border border-[var(--color-border)] rounded-md text-sm text-muted cursor-not-allowed"
                />
              </FormField>

              <div className="pt-4">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Save size={16} />
                  <span>Save changes</span>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a] mb-1">Password & Security</h2>
                <p className="text-sm text-muted">Manage your password and security settings</p>
              </div>

              <FormField label="Current Password">
                <input
                  type="password"
                  value={formData.currentPassword}
                  onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
              </FormField>

              <FormField label="New Password">
                <input
                  type="password"
                  value={formData.newPassword}
                  onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
              </FormField>

              <FormField label="Confirm New Password">
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
              </FormField>

              <div className="pt-4">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Save size={16} />
                  <span>Update password</span>
                </button>
              </div>

              <div className="pt-6 border-t border-[var(--color-border)]">
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Active Sessions</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-2">
                      <Monitor size={16} className="text-muted" />
                      <div>
                        <div className="text-sm text-[#0f172a]">Chrome on Windows</div>
                        <div className="text-xs text-muted">Current session • Active now</div>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--color-success)] font-medium">Current</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-2">
                      <Smartphone size={16} className="text-muted" />
                      <div>
                        <div className="text-sm text-[#0f172a]">Safari on iPhone</div>
                        <div className="text-xs text-muted">Last active 2 hours ago</div>
                      </div>
                    </div>
                    <button className="text-xs text-danger hover:underline">Revoke</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a] mb-1">Notifications</h2>
                <p className="text-sm text-muted">Manage your notification preferences</p>
              </div>

              <FormField label="Email Notifications">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.emailNotifications}
                    onChange={(e) => setFormData({ ...formData, emailNotifications: e.target.checked })}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm text-[#0f172a]">Receive email notifications</span>
                </div>
              </FormField>

              <FormField label="Deadline Reminders" helperText="Get notified before tasks are due">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.deadlineReminders}
                    onChange={(e) => setFormData({ ...formData, deadlineReminders: e.target.checked })}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm text-[#0f172a]">Enable deadline reminders</span>
                </div>
              </FormField>

              <FormField label="Update Summaries" helperText="Receive daily/weekly digest of task updates">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.updateSummaries}
                    onChange={(e) => setFormData({ ...formData, updateSummaries: e.target.checked })}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm text-[#0f172a]">Enable update summaries</span>
                </div>
              </FormField>

              <div className="pt-4">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Save size={16} />
                  <span>Save preferences</span>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a] mb-1">Appearance</h2>
                <p className="text-sm text-muted">Customize the look and feel</p>
              </div>

              <FormField label="Theme Mode">
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsDarkMode(false)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border transition-colors ${
                      !isDarkMode
                        ? 'border-[var(--color-accent)] bg-blue-50 text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] hover:bg-gray-50'
                    }`}
                  >
                    <Sun size={16} />
                    <span className="text-sm">Light</span>
                  </button>
                  <button
                    onClick={() => setIsDarkMode(true)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border transition-colors ${
                      isDarkMode
                        ? 'border-[var(--color-accent)] bg-blue-50 text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] hover:bg-gray-50'
                    }`}
                  >
                    <Moon size={16} />
                    <span className="text-sm">Dark</span>
                  </button>
                </div>
              </FormField>

              <FormField label="Density Preference">
                <select
                  value={formData.density}
                  onChange={(e) => setFormData({ ...formData, density: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                  <option value="spacious">Spacious</option>
                </select>
              </FormField>

              <div className="pt-4">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Save size={16} />
                  <span>Save preferences</span>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'help' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a] mb-1">Help & Documentation</h2>
                <p className="text-sm text-muted">Get help and learn more about PMS</p>
              </div>

              <div className="space-y-3">
                <a href="#" className="block p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-medium text-[#0f172a] mb-1">Getting Started Guide</div>
                  <div className="text-xs text-muted">Learn the basics of PMS</div>
                </a>
                <a href="#" className="block p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-medium text-[#0f172a] mb-1">Task Management</div>
                  <div className="text-xs text-muted">How to create and manage tasks</div>
                </a>
                <a href="#" className="block p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-medium text-[#0f172a] mb-1">Schedules & Recurring Work</div>
                  <div className="text-xs text-muted">Set up automated task generation</div>
                </a>
                <a href="#" className="block p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-medium text-[#0f172a] mb-1">Team Collaboration</div>
                  <div className="text-xs text-muted">Work effectively with your team</div>
                </a>
              </div>

              <div className="pt-6 border-t border-[var(--color-border)]">
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Support</h3>
                <a href="mailto:support@trustgrid.com" className="text-sm text-[var(--color-accent)] hover:underline">
                  Contact Support
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
