import React, { useState } from 'react';
import { X, Bell, Mail, Check } from 'lucide-react';

interface ConfigureNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: NotificationSettings) => void;
}

interface NotificationSettings {
  taskAssigned: boolean;
  taskDueSoon: boolean;
  taskOverdue: boolean;
  reportSubmitted: boolean;
  systemAlerts: boolean;
}

export default function ConfigureNotificationsModal({ isOpen, onClose, onSave }: ConfigureNotificationsModalProps) {
  const [settings, setSettings] = useState<NotificationSettings>({
    taskAssigned: true,
    taskDueSoon: true,
    taskOverdue: true,
    reportSubmitted: true,
    systemAlerts: true,
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(settings);
    onClose();
  };

  const toggleSetting = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Email Notifications</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between p-3 sm:p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Mail className="text-blue-500" size={18} />
                <div>
                  <h3 className="font-medium text-sm sm:text-base text-slate-900">Task Assigned</h3>
                  <p className="text-xs sm:text-sm text-slate-500">When a task is assigned to you</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('taskAssigned')}
                className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors ${settings.taskAssigned ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <div className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow transform transition-transform ${settings.taskAssigned ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 sm:p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Bell className="text-orange-500" size={18} />
                <div>
                  <h3 className="font-medium text-sm sm:text-base text-slate-900">Task Due Soon</h3>
                  <p className="text-xs sm:text-sm text-slate-500">When a task is due within 24 hours</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('taskDueSoon')}
                className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors ${settings.taskDueSoon ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <div className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow transform transition-transform ${settings.taskDueSoon ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 sm:p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Bell className="text-red-500" size={18} />
                <div>
                  <h3 className="font-medium text-sm sm:text-base text-slate-900">Task Overdue</h3>
                  <p className="text-xs sm:text-sm text-slate-500">When a task becomes overdue</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('taskOverdue')}
                className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors ${settings.taskOverdue ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <div className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow transform transition-transform ${settings.taskOverdue ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 sm:p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Check className="text-green-500" size={18} />
                <div>
                  <h3 className="font-medium text-sm sm:text-base text-slate-900">Report Submitted</h3>
                  <p className="text-xs sm:text-sm text-slate-500">When a progress report is submitted</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('reportSubmitted')}
                className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors ${settings.reportSubmitted ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <div className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow transform transition-transform ${settings.reportSubmitted ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 sm:p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Bell className="text-purple-500" size={18} />
                <div>
                  <h3 className="font-medium text-sm sm:text-base text-slate-900">System Alerts</h3>
                  <p className="text-xs sm:text-sm text-slate-500">Important system notifications</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('systemAlerts')}
                className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors ${settings.systemAlerts ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <div className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow transform transition-transform ${settings.systemAlerts ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="flex space-x-2 sm:space-x-3 pt-3 sm:pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors text-xs sm:text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors text-xs sm:text-sm"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
