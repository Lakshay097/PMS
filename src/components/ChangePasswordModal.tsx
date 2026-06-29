import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (oldPassword: string, newPassword: string) => void;
  isDarkMode?: boolean;
}

export default function ChangePasswordModal({ isOpen, onClose, onSave, isDarkMode = false }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    onSave(oldPassword, newPassword);
    onClose();
    // Reset form
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`rounded-xl shadow-2xl w-full max-w-md ${isDarkMode ? 'bg-[#0F141F]' : 'bg-white'}`}>
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Change Password</h2>
          <button onClick={onClose} className={`transition-colors ${isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className={`rounded-lg p-3 text-sm ${isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}`}>
              {error}
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Current Password</label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} size={18} />
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className={`w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>New Password</label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} size={18} />
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Confirm New Password</label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} size={18} />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2.5 border rounded-lg font-medium transition-colors ${isDarkMode ? 'border-[#334155] text-slate-300 hover:bg-[#1E293B]/50' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
