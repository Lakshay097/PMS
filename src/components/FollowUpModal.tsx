import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CornerRightDown, HelpCircle } from 'lucide-react';
import { Task } from '../types';

interface FollowUpModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (parentTaskId: string, reason: string) => void;
}

export default function FollowUpModal({ task, isOpen, onClose, onSubmit }: FollowUpModalProps) {
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
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-md overflow-hidden font-sans"
      >
        <div className="bg-[#0F172A] px-6 py-4.5 flex items-center justify-between border-b border-[#1E293B]">
          <div className="flex items-center space-x-2.5">
            <CornerRightDown className="text-[#3B82F6]" size={18} />
            <h3 className="text-white font-bold text-base tracking-tight font-sans">Initiate Task Follow-Up</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start space-x-2">
            <HelpCircle size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold block uppercase tracking-wider mb-1">Follow-Up Workflow Rules</p>
              This will create a linked child task referencing <strong>{task.TaskID}</strong>, incrementing its follow-up lineage count. It preserves original properties (assignees) while assigning a new schedule for remediation or reviews.
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg border border-[#E2E8F0] p-3">
            <span className="text-[10px] font-mono text-[#64748B] tracking-wider block uppercase font-bold">Original Parent Task</span>
            <span className="font-semibold text-slate-800 text-sm block mt-0.5">{task.Title}</span>
            <span className="text-xs text-slate-500">Assigned to: {task.AssignedToEmail}</span>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
              Follow-Up Reason / Scope <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why further remediation or audit is required..."
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            ></textarea>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer border-none"
            >
              Generate Follow-Up
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
