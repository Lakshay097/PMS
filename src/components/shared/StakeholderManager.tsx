import React, { useMemo, useState } from 'react';
import { UserPlus, X, Search, Users } from 'lucide-react';
import { User as UserType } from '../../types';
import { ROLE, isAdminLevel } from '../../constants/status';

export interface StakeholderManagerProps {
  /** Current stakeholder emails on the task/follow-up */
  stakeholderEmails: string[];
  users: UserType[];
  currentUser?: UserType | null;
  /** When false, renders read-only chips (non-admins) */
  canManage?: boolean;
  disabled?: boolean;
  isDarkMode?: boolean;
  title?: string;
  onChange: (nextEmails: string[]) => void;
  /** Optional: called after a single add/remove with the delta for email side-effects */
  onStakeholdersChanged?: (payload: {
    previous: string[];
    next: string[];
    added: string[];
    removed: string[];
  }) => void;
}

/**
 * Admin-only add/remove UI for task (and follow-up) stakeholders.
 * Reuse this for Tasks list actions, Task detail, and Follow-up flows.
 */
export default function StakeholderManager({
  stakeholderEmails,
  users,
  currentUser,
  canManage,
  disabled = false,
  isDarkMode = false,
  title = 'Stakeholders',
  onChange,
  onStakeholdersChanged,
}: StakeholderManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');

  const isAdmin = canManage ?? (currentUser ? isAdminLevel(currentUser.Role) : false);

  const currentSet = useMemo(
    () => new Set(stakeholderEmails.map(e => e.toLowerCase())),
    [stakeholderEmails]
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => u.Active)
      .filter(u => u.Role === ROLE.STAKEHOLDER || u.Role === ROLE.SUB_STAKEHOLDER || isAdminLevel(u.Role))
      .filter(u => !currentSet.has(u.Email.toLowerCase()))
      .filter(u =>
        !q ||
        u.FullName?.toLowerCase().includes(q) ||
        u.Email?.toLowerCase().includes(q)
      )
      .sort((a, b) => (a.FullName || '').localeCompare(b.FullName || ''));
  }, [users, currentSet, search]);

  const resolveName = (email: string) => {
    const user = users.find(u => u.Email.toLowerCase() === email.toLowerCase());
    return user?.FullName || email;
  };

  const emitChange = (next: string[]) => {
    const previous = [...stakeholderEmails];
    const prevLower = new Set(previous.map(e => e.toLowerCase()));
    const nextLower = new Set(next.map(e => e.toLowerCase()));
    const added = next.filter(e => !prevLower.has(e.toLowerCase()));
    const removed = previous.filter(e => !nextLower.has(e.toLowerCase()));
    onChange(next);
    onStakeholdersChanged?.({ previous, next, added, removed });
  };

  const addEmail = (email: string) => {
    if (disabled || !isAdmin) return;
    if (currentSet.has(email.toLowerCase())) return;
    emitChange([...stakeholderEmails, email]);
    setSearch('');
    setIsAdding(false);
  };

  const removeEmail = (email: string) => {
    if (disabled || !isAdmin) return;
    emitChange(stakeholderEmails.filter(e => e.toLowerCase() !== email.toLowerCase()));
  };

  const panel = isDarkMode
    ? 'bg-[#0F141F] border-[#1E293B]'
    : 'bg-white border-[#E5E7EB]';
  const chip = isDarkMode
    ? 'bg-[#1E293B] text-slate-200 border-[#334155]'
    : 'bg-slate-50 text-slate-800 border-slate-200';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${panel}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase ${muted}`}>
          <Users size={12} />
          <span>{title}</span>
          <span className="font-mono normal-case tracking-normal">({stakeholderEmails.length})</span>
        </div>
        {isAdmin && !disabled && (
          <button
            type="button"
            onClick={() => setIsAdding(v => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2563EB] hover:text-[#1d4ed8] bg-transparent border-none cursor-pointer"
          >
            <UserPlus size={12} />
            Add Stakeholder
          </button>
        )}
      </div>

      {stakeholderEmails.length === 0 ? (
        <p className={`text-xs italic ${muted}`}>No stakeholders on this item.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {stakeholderEmails.map(email => (
            <span
              key={email}
              className={`inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded border text-[11px] ${chip}`}
              title={email}
            >
              <span className="truncate">{resolveName(email)}</span>
              {isAdmin && !disabled && (
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="shrink-0 p-0.5 rounded hover:bg-red-500/10 text-muted hover:text-red-500 border-none bg-transparent cursor-pointer"
                  aria-label={`Remove ${email}`}
                  title="Remove"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {isAdmin && isAdding && !disabled && (
        <div className={`mt-1 rounded-md border p-2 space-y-2 ${isDarkMode ? 'border-[#334155] bg-[#1E293B]' : 'border-slate-200 bg-slate-50'}`}>
          <div className="relative">
            <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${muted}`} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users to add..."
              autoFocus
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDarkMode
                  ? 'bg-[#0F141F] border-[#334155] text-white'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            />
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {candidates.length === 0 ? (
              <div className={`text-xs italic py-2 text-center ${muted}`}>No matching users</div>
            ) : (
              candidates.slice(0, 40).map(user => (
                <button
                  key={user.UserID}
                  type="button"
                  onClick={() => addEmail(user.Email)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs cursor-pointer border-none ${
                    isDarkMode ? 'hover:bg-[#334155] text-slate-200 bg-transparent' : 'hover:bg-slate-100 text-slate-800 bg-transparent'
                  }`}
                >
                  <span className="font-semibold block">{user.FullName}</span>
                  <span className={`font-mono text-[10px] ${muted}`}>{user.Email}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
