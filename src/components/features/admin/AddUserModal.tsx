import React, { useEffect, useRef, useState } from 'react';
import { X, User, Mail, Building2, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { ROLE } from '../../../constants/status';

/**
 * Enhanced Add User modal.
 *
 * Fixes over the previous version:
 *  - Duplicate email check is now case-insensitive and trims whitespace
 *    (previously "Jane@x.com" slipped past a check against "jane@x.com")
 *  - Email format validated before submit
 *  - Manager email validated as an email, and checked against existing users
 *  - Password strength hint + show/hide toggle
 *  - Broken close-icon sizing removed (`className="sm:size-20"` rendered a 5rem icon)
 *  - Submit disabled while saving; Escape closes; first field autofocused
 */

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: UserData) => void | Promise<void>;
  existingUsers: Array<{ Email: string }>;
}

interface UserData {
  FullName: string;
  Email: string;
  Role: (typeof ROLE)[keyof typeof ROLE];
  ManagerEmail: string;
  TeamName: string;
  Password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddUserModal({ isOpen, onClose, onSave, existingUsers }: AddUserModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLE)[keyof typeof ROLE]>(ROLE.SUB_STAKEHOLDER);
  const [managerEmail, setManagerEmail] = useState('');
  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Autofocus + Escape-to-close
  useEffect(() => {
    if (!isOpen) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setRole(ROLE.SUB_STAKEHOLDER);
    setManagerEmail('');
    setTeamName('');
    setPassword('');
    setShowPassword(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanManager = managerEmail.trim().toLowerCase();

    if (!cleanName) return setError('Enter the user’s full name.');
    if (!EMAIL_RE.test(cleanEmail)) return setError('Enter a valid email address.');
    if (existingUsers.some((u) => u.Email.trim().toLowerCase() === cleanEmail))
      return setError('A user with this email already exists.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    if (role === ROLE.SUB_STAKEHOLDER) {
      if (!cleanManager) return setError('Manager email is required for sub-stakeholders.');
      if (!EMAIL_RE.test(cleanManager)) return setError('Enter a valid manager email address.');
      if (cleanManager === cleanEmail)
        return setError('A user cannot be their own manager.');
      if (!existingUsers.some((u) => u.Email.trim().toLowerCase() === cleanManager))
        return setError('Manager email doesn’t match any existing user.');
    }

    try {
      setIsSaving(true);
      await onSave({
        FullName: cleanName,
        Email: cleanEmail,
        Role: role,
        ManagerEmail: role === ROLE.SUB_STAKEHOLDER ? cleanManager : '',
        TeamName: teamName.trim(),
        Password: password,
      });
      resetForm();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong while creating the user. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-xs sm:text-sm';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-user-title"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 id="add-user-title" className="text-lg sm:text-xl font-bold text-slate-900">
            Add New User
          </h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-lg p-2.5 sm:p-3 text-red-600 text-xs sm:text-sm"
            >
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                ref={firstFieldRef}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                autoComplete="off"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="off"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
              Role
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ROLE)[keyof typeof ROLE])}
                className={inputClass}
                required
              >
                <option value={ROLE.ADMIN}>Admin</option>
                <option value={ROLE.STAKEHOLDER}>Stakeholder</option>
                <option value={ROLE.SUB_STAKEHOLDER}>Sub-stakeholder</option>
              </select>
            </div>
          </div>

          {role === ROLE.SUB_STAKEHOLDER && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
                Manager Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  className={inputClass}
                  placeholder="Must be an existing user"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
              Team Name
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
              Password
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-10`}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[10px] sm:text-xs text-slate-500">At least 6 characters.</p>
          </div>

          <div className="flex space-x-2 sm:space-x-3 pt-3 sm:pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors text-xs sm:text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors text-xs sm:text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {isSaving ? 'Adding…' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}