import React from 'react';
import { Loader2, Link, Unlink } from 'lucide-react';

interface SettingsProps {
  onEditProfile: () => void;
  onChangePassword: () => void;
  onConfigureNotifications: () => void;
  gmailConnected: boolean;
  gmailLoading: boolean;
  connectionMessage: { type: 'success' | 'error'; text: string } | null;
  handleConnectGmail: () => void;
  handleDisconnectGmail: () => void;
  isDarkMode: boolean;
  onToggleTheme?: () => void;
  onLogout: () => void;
}

export default function Settings({
  onEditProfile,
  onChangePassword,
  onConfigureNotifications,
  gmailConnected,
  gmailLoading,
  connectionMessage,
  handleConnectGmail,
  handleDisconnectGmail,
  isDarkMode,
  onToggleTheme,
  onLogout,
}: SettingsProps) {
  return (
    <div className="space-y-6">
      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-token' : 'bg-surface border-token'}`}>
        <h3 className={`font-semibold text-lg mb-6 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Account Settings</h3>

        <div className="space-y-6">
          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Profile Information</h4>
                <p className={`text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>Update your personal details</p>
              </div>
              <button
                onClick={onEditProfile}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Edit Profile
              </button>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Change Password</h4>
                <p className={`text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>Update your password</p>
              </div>
              <button
                onClick={onChangePassword}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Change Password
              </button>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Email Notifications</h4>
                <p className={`text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>Manage email notification preferences</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400 text-sm font-medium">Enabled</span>
                <button
                  onClick={onConfigureNotifications}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}`}
                >
                  Configure
                </button>
              </div>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Email Integration</h4>
                <p className={`text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>Connect Gmail to send emails as yourself</p>
              </div>
              <div className="flex items-center space-x-2">
                {gmailConnected ? (
                  <span className="text-green-400 text-sm font-medium">Connected</span>
                ) : (
                  <span className="text-secondary text-sm font-medium">Not Connected</span>
                )}
                <button
                  onClick={gmailConnected ? handleDisconnectGmail : handleConnectGmail}
                  disabled={gmailLoading}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {gmailLoading ? <Loader2 size={16} className="animate-spin" /> : gmailConnected ? <Unlink size={16} /> : <Link size={16} />}
                  <span>{gmailLoading ? 'Loading...' : gmailConnected ? 'Disconnect' : 'Connect'}</span>
                </button>
              </div>
            </div>
            {connectionMessage && (
              <div className={`mt-3 p-3 rounded-md text-sm ${connectionMessage.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {connectionMessage.text}
              </div>
            )}
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Theme Preference</h4>
                <p className={`text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>{isDarkMode ? 'Dark theme is currently active' : 'Light theme is currently active'}</p>
              </div>
              <button
                onClick={() => onToggleTheme && onToggleTheme()}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}`}
              >
                {isDarkMode ? 'Switch to Light' : 'Switch to Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-token' : 'bg-surface border-token'}`}>
        <h3 className={`font-semibold text-lg mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Danger Zone</h3>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Delete Account</h4>
              <p className={`text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>Permanently delete your account and all data</p>
            </div>
            <button
              onClick={onLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
