import React from 'react';
import { User as UserType, AppSetting, EmailTemplate } from '../types';
import DashboardSettings from '../components/settings/DashboardSettings';

interface SettingsPageProps {
  currentUser: UserType;
  settings?: AppSetting[];
  emailTemplates?: EmailTemplate[];
  onUpdateSetting?: (key: string, value: string) => void;
  onEditProfile?: () => void;
  onChangePassword?: () => void;
  onConfigureNotifications?: () => void;
  onLogout?: () => void;
  gmailConnected?: boolean;
  gmailLoading?: boolean;
  connectionMessage?: { type: 'success' | 'error'; text: string } | null;
  onConnectGmail?: () => void;
  onDisconnectGmail?: () => void;
}

export default function SettingsPage({
  currentUser,
  settings = [],
  emailTemplates = [],
  onUpdateSetting,
  onEditProfile,
  onChangePassword,
  onConfigureNotifications,
  onLogout,
  gmailConnected = false,
  gmailLoading = false,
  connectionMessage = null,
  onConnectGmail,
  onDisconnectGmail,
}: SettingsPageProps) {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <DashboardSettings
          onEditProfile={onEditProfile}
          onChangePassword={onChangePassword}
          onConfigureNotifications={onConfigureNotifications}
          onLogout={onLogout}
          gmailConnected={gmailConnected}
          gmailLoading={gmailLoading}
          connectionMessage={connectionMessage}
          onConnectGmail={onConnectGmail}
          onDisconnectGmail={onDisconnectGmail}
        />
      </div>
    </div>
  );
}
