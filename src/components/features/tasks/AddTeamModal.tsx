import React, { useState } from 'react';
import { X, Building2, Users } from 'lucide-react';

interface AddTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (teamData: TeamData) => void;
  users?: any[];
}

interface TeamData {
  TeamName: string;
  Description: string;
  StakeholderEmails?: string[];
}

export default function AddTeamModal({ isOpen, onClose, onSave, users = [] }: AddTeamModalProps) {
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [selectedStakeholders, setSelectedStakeholders] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    onSave({
      TeamName: teamName.trim(),
      Description: description.trim(),
      StakeholderEmails: selectedStakeholders
    });
    onClose();
    // Reset form
    setTeamName('');
    setDescription('');
    setSelectedStakeholders([]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-[#E5E7EB] flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add New Team</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Team Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description (Optional)</label>
            <div className="relative">
              <Users className="absolute left-3 top-3 text-slate-400" size={18} />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 resize-none"
                rows={3}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Assign Stakeholders (Optional)</label>
            <div className="border border-slate-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
              {users.filter(u => u.Active && u.Role === 'Stakeholder').length === 0 ? (
                <div className="text-slate-400 text-xs italic py-1">No stakeholders available</div>
              ) : (
                users.filter(u => u.Active && u.Role === 'Stakeholder').map(user => (
                  <label key={user.UserID} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStakeholders.includes(user.Email)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStakeholders([...selectedStakeholders, user.Email]);
                        } else {
                          setSelectedStakeholders(selectedStakeholders.filter(email => email !== user.Email));
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{user.FullName}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Add Team
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
