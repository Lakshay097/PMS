import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X, User, Mail, Building2, Lock, Moon, Sun } from 'lucide-react';
import { User as UserType } from '../types';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  onSave: (updatedUser: Partial<UserType>) => void;
  onChangePassword?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

export default function EditProfileModal({ isOpen, onClose, currentUser, onSave, onChangePassword, isDarkMode = false, onToggleTheme }: EditProfileModalProps) {
  const [fullName, setFullName] = useState(currentUser.FullName);
  const [email, setEmail] = useState(currentUser.Email);
  const [teamName, setTeamName] = useState(currentUser.TeamName);

  const handleChangePasswordClick = () => {
    if (onChangePassword) {
      onChangePassword();
    }
  };

  const handleToggleTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      FullName: fullName,
      Email: email,
      TeamName: teamName,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-[#E5E7EB] flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Edit Profile</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} className="sm:size-[18px]" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={fullName}
                readOnly
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed text-xs sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="email"
                value={email}
                readOnly
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed text-xs sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Team Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={teamName}
                readOnly
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* Additional Options Section */}
          <div className="pt-3 sm:pt-4 border-t border-[#E5E7EB] space-y-2 sm:space-y-3">
            <button
              type="button"
              onClick={handleChangePasswordClick}
              className="w-full flex items-center justify-center gap-2 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors text-xs sm:text-sm"
            >
              <Lock size={14} />
              <span className="hidden sm:inline">Change Password</span>
              <span className="sm:hidden">Password</span>
            </button>

            <button
              type="button"
              onClick={handleToggleTheme}
              className="w-full flex items-center justify-center gap-2 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors text-xs sm:text-sm"
            >
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
              <span className="hidden sm:inline">{isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              <span className="sm:hidden">Theme</span>
            </button>
          </div>

          <div className="flex space-x-2 sm:space-x-3 pt-3 sm:pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors text-xs sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
