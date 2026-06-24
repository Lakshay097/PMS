import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, AlertTriangle, Link as LinkIcon, Sparkles, Upload, File, Image as ImageIcon } from 'lucide-react';
import { Task, TaskStatus } from '../types';

interface CreateReportModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reportData: {
    TaskID: string;
    StatusUpdate: TaskStatus;
    WorkSummary: string;
    PercentComplete: number;
    Blockers: string;
    NextAction: string;
    AttachmentLink: string;
    UploadedFiles: File[];
  }) => void;
}

export default function CreateReportModal({ task, isOpen, onClose, onSubmit }: CreateReportModalProps) {
  const [workSummary, setWorkSummary] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<TaskStatus>(task.Status);
  const [blockers, setBlockers] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workSummary.trim()) return;

    // Simulate completion percentage mapping behind the scenes to preserve database schemas
    const simulatedPercent = statusUpdate === 'Closed' ? 100 : (statusUpdate === 'Submitted' ? 90 : (statusUpdate === 'Not Started' ? 0 : 50));

    onSubmit({
      TaskID: task.TaskID,
      StatusUpdate: statusUpdate,
      WorkSummary: workSummary,
      PercentComplete: simulatedPercent,
      Blockers: blockers,
      NextAction: nextAction,
      AttachmentLink: attachmentLink,
      UploadedFiles: uploadedFiles
    });
    
    // reset
    setWorkSummary('');
    setBlockers('');
    setNextAction('');
    setAttachmentLink('');
    setUploadedFiles([]);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-xl overflow-hidden font-sans"
      >
        <div className="bg-[#0F172A] px-6 py-4.5 flex items-center justify-between border-b border-[#1E293B]">
          <div>
            <span className="text-[9px] bg-[#2563EB]/10 text-[#3B82F6] font-bold font-mono px-2.5 py-1 rounded-full border border-[#2563EB]/25 uppercase tracking-wider">
              Append-Only Report
            </span>
            <h3 className="text-white font-bold text-base tracking-tight mt-1.5 font-sans">Submit Progress Report</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors duration-150 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg p-3">
            <span className="text-[10px] font-mono text-[#64748B] tracking-wider block uppercase font-bold">Active Task</span>
            <span className="font-bold text-[#0F172A] text-sm mt-0.5 block">{task.Title}</span>
            <span className="text-xs text-slate-500 font-medium">{task.TaskID}</span>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
              New Task Status
            </label>
            <select
              value={statusUpdate}
              onChange={(e) => setStatusUpdate(e.target.value as TaskStatus)}
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Submitted">Submitted (Review Request)</option>
              <option value="Closed">Closed</option>
              <option value="Reopened">Reopened</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
              Work Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              placeholder="What specific tasks have been worked on? Reconciliations completed? Discrepancies cleared?"
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            ></textarea>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1 flex items-center space-x-1">
                <AlertTriangle size={12} className="text-amber-500" />
                <span>Active Blockers (Optional)</span>
              </label>
              <input
                type="text"
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="Discrepancy in invoice data, etc."
                className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                Next Immediate Action
              </label>
              <input
                type="text"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="Liaise with supervisor for approval"
                className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1 flex items-center space-x-1">
              <LinkIcon size={12} />
              <span>Attachment / Deliverable URI (Optional)</span>
            </label>
            <input
              type="url"
              value={attachmentLink}
              onChange={(e) => setAttachmentLink(e.target.value)}
              placeholder="https://example.com/your-deliverable-link"
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1 flex items-center space-x-1">
              <Upload size={12} />
              <span>Upload Files / Photos (Optional)</span>
            </label>
            <div className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-4">
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                <Upload className="text-slate-400 mb-2" size={24} />
                <p className="text-xs text-slate-600 text-center">
                  Click to upload files or drag and drop
                </p>
                <p className="text-[10px] text-slate-400 text-center mt-1">
                  Images, PDFs, Documents (Max 10MB each)
                </p>
              </label>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Uploaded Files:</p>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-50 border border-[#E2E8F0] rounded-lg p-2">
                    <div className="flex items-center space-x-2">
                      {file.type.startsWith('image/') ? (
                        <ImageIcon className="text-blue-500" size={16} />
                      ) : (
                        <File className="text-slate-500" size={16} />
                      )}
                      <span className="text-xs text-slate-700 truncate max-w-[200px]">{file.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center space-x-2 cursor-pointer border-none"
            >
              <Send size={13} />
              <span>Publish Report</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
