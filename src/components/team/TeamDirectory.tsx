import React, { useState } from 'react';
import Drawer from '../shared/Drawer';
import FilterChip from '../shared/FilterChip';
import { Plus, Search, MoreVertical, Mail, User as UserIcon, Briefcase, Users, Shield, Clock } from 'lucide-react';
import { User } from '../../types';

interface TeamDirectoryProps {
  users: User[];
  onInviteUser?: () => void;
  onUserClick?: (userId: string) => void;
}

export default function TeamDirectory({ users, onInviteUser, onUserClick }: TeamDirectoryProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Admin' | 'Stakeholder' | 'Sub-stakeholder'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Get unique teams
  const teams = Array.from(new Set(users.flatMap(u => u.TeamNames || [])));

  // Filter users
  const filteredUsers = users.filter(user => {
    if (searchQuery && !user.FullName.toLowerCase().includes(searchQuery.toLowerCase()) && !user.Email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (roleFilter !== 'all' && user.Role !== roleFilter) return false;
    if (teamFilter !== 'all' && !user.TeamIDs.includes(teamFilter)) return false;
    if (activeFilter === 'active' && !user.Active) return false;
    if (activeFilter === 'inactive' && user.Active) return false;
    return true;
  });

  const handleUserClick = (user: User) => {
    setSelectedUser(user);
    onUserClick?.(user.UserID);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">Team Directory</h1>
          <p className="text-sm text-muted mt-1">Manage users, roles, and work ownership</p>
        </div>
        {onInviteUser && (
          <button
            onClick={onInviteUser}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Plus size={16} />
            <span>Invite user</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
          />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All roles"
            active={roleFilter === 'all'}
            onClick={() => setRoleFilter('all')}
          />
          <FilterChip
            label="Admin"
            active={roleFilter === 'Admin'}
            onClick={() => setRoleFilter('Admin')}
          />
          <FilterChip
            label="Stakeholder"
            active={roleFilter === 'Stakeholder'}
            onClick={() => setRoleFilter('Stakeholder')}
          />
          <FilterChip
            label="Sub-stakeholder"
            active={roleFilter === 'Sub-stakeholder'}
            onClick={() => setRoleFilter('Sub-stakeholder')}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All teams"
            active={teamFilter === 'all'}
            onClick={() => setTeamFilter('all')}
          />
          {teams.map(team => (
            <div key={team}>
              <FilterChip
                label={team}
                active={teamFilter === team}
                onClick={() => setTeamFilter(team)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="All status"
            active={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
          />
          <FilterChip
            label="Active"
            active={activeFilter === 'active'}
            onClick={() => setActiveFilter('active')}
          />
          <FilterChip
            label="Inactive"
            active={activeFilter === 'inactive'}
            onClick={() => setActiveFilter('inactive')}
          />
        </div>
      </div>

      {/* People Table */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)] overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <UserIcon size={48} className="text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">No users found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Reports to
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.UserID}
                    onClick={() => handleUserClick(user)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-[#0f172a]">
                            {user.FullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#0f172a]">{user.FullName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-[#0f172a]">
                        <Mail size={14} className="text-muted" />
                        <span>{user.Email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-[#0f172a]">
                        <Shield size={12} className="text-muted" />
                        {user.Role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-[#0f172a]">
                        <Users size={14} className="text-muted" />
                        <span>{(user.TeamNames || []).join(', ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted">{user.ManagerEmail || 'None'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        user.Active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.Active ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {user.Active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <MoreVertical size={16} className="text-muted" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Person Detail Drawer */}
      <Drawer
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        size="md"
        position="right"
      >
        {selectedUser && (
          <div className="h-full flex flex-col">
            {/* Profile Section */}
            <div className="p-6 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-xl font-medium text-[#0f172a]">
                    {selectedUser.FullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#0f172a]">{selectedUser.FullName}</h2>
                  <p className="text-sm text-muted">{selectedUser.Email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-[#0f172a]">
                  <Shield size={12} className="text-muted" />
                  {selectedUser.Role}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  selectedUser.Active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {selectedUser.Active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 border-b border-[var(--color-border)]">
              <nav className="flex gap-1">
                {['Profile', 'Current Task Load', 'Recurring Work', 'Recent Activity', 'Permissions'].map((tab) => (
                  <button
                    key={tab}
                    className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-muted hover:text-[#0f172a] transition-colors"
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Details */}
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Profile Details</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Briefcase size={16} className="text-muted" />
                    <div>
                      <div className="text-xs text-muted">Team</div>
                      <div className="text-sm text-[#0f172a]">{selectedUser.TeamName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <UserIcon size={16} className="text-muted" />
                    <div>
                      <div className="text-xs text-muted">Reports to</div>
                      <div className="text-sm text-[#0f172a]">{selectedUser.ManagerEmail || 'None'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-muted" />
                    <div>
                      <div className="text-xs text-muted">Member since</div>
                      <div className="text-sm text-[#0f172a]">{new Date(selectedUser.CreatedAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-3">Permissions</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="text-sm text-[#0f172a]">Create follow-up tasks</span>
                    <span className={`text-xs font-medium ${selectedUser.CanCreateFollowUp ? 'text-green-600' : 'text-gray-400'}`}>
                      {selectedUser.CanCreateFollowUp ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="text-sm text-[#0f172a]">Close tasks</span>
                    <span className={`text-xs font-medium ${selectedUser.CanCloseTask ? 'text-green-600' : 'text-gray-400'}`}>
                      {selectedUser.CanCloseTask ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
