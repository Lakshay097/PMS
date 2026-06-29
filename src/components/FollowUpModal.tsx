import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CornerRightDown, HelpCircle } from 'lucide-react';
import { Task } from '../types';

interface FollowUpModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (parentTaskId: string, reason: string) => void;
  isDarkMode?: boolean;
}

export default function FollowUpModal({ task, isOpen, onClose, onSubmit, isDarkMode = false }: FollowUpModalProps) {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    onSubmit(task.TaskID, reason);
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E2E8F0]'} rounded-xl shadow-xl w-full max-w-md overflow-hidden font-sans`}
      >
        <div className={`${isDarkMode ? 'bg-[#0F172A] border-[#1E293B]' : 'bg-slate-800 border-slate-700'} px-6 py-4.5 flex items-center justify-between border-b`}>
          <div className="flex items-center space-x-2.5">
            <CornerRightDown className="text-[#3B82F6]" size={18} />
            <h3 className="text-white font-bold text-base tracking-tight font-sans">Initiate Task Follow-Up</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className={`${isDarkMode ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'} rounded-lg p-3 text-xs flex items-start space-x-2`}>
            <HelpCircle size={16} className={`${isDarkMode ? 'text-blue-400' : 'text-blue-500'} mt-0.5 flex-shrink-0`} />
            <div>
              <p className="font-semibold block mb-1">Follow-up workflow rules</p>
              This will create a linked child task referencing <strong>{task.TaskID}</strong>, incrementing its follow-up lineage count. It preserves original properties (assignees) while assigning a new schedule for remediation or reviews.
            </div>
          </div>

          <div className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-[#E2E8F0]'} rounded-lg p-3`}>
            <span className={`text-[10px] font-mono tracking-wider block font-bold ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Original parent task</span>
            <span className={`font-semibold text-sm block mt-0.5 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{task.Title}</span>
            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Assigned to: {task.AssignedToEmail}</span>
          </div>

          <div>
            <label className={`block text-[10px] font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>
              Follow-up reason / scope <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why further remediation or audit is required..."
              className={`w-full text-xs rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-[#2563EB] ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
            ></textarea>
          </div>

          <div className={`pt-4 border-t flex items-center justify-end space-x-3 ${isDarkMode ? 'border-slate-700' : 'border-[#E2E8F0]'}`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 border transition-all rounded-lg text-xs font-bold cursor-pointer ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-[#E2E8F0] text-slate-700 hover:bg-slate-50'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer border-none"
            >
              Generate follow-up
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
