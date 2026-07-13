import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, AlertTriangle, Link as LinkIcon, Sparkles, Upload, File, Image as ImageIcon } from 'lucide-react';
import { Task, TaskStatus, User as UserType, Subtask } from '../types';
import { uploadFile } from '../api/upload';

interface CreateReportModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  subtasks: Subtask[];
  onSubmit: (reportData: {
    TaskID: string;
    SubtaskID?: string;
    StatusUpdate: TaskStatus;
    WorkSummary: string;
    PercentComplete: number;
    Blockers: string;
    NextAction: string;
    AttachmentLink: string;
  }) => void;
}

export default function CreateReportModal({ task, isOpen, onClose, onSubmit, currentUser, subtasks }: CreateReportModalProps) {
  const [workSummary, setWorkSummary] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<TaskStatus>(
    task.Status === 'Not Started' || task.Status === 'Closed' ? 'In Progress' : task.Status
  );
  const [blockers, setBlockers] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; data: string; size: number }>>([]);
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string>('');
  const [statusReason, setStatusReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user is assigned to any subtasks
  const userSubtasks = subtasks.filter(s => s.AssignedTo === currentUser.Email);
  const showSubtaskSelector = subtasks.length > 0 && userSubtasks.length > 0;

  // Pre-select subtask if user is assigned to exactly one
  React.useEffect(() => {
    if (userSubtasks.length === 1) {
      setSelectedSubtaskId(userSubtasks[0].SubtaskID);
    }
  }, [userSubtasks]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workSummary.trim()) return;

    // Require reason for On Hold and Dropped statuses
    if ((statusUpdate === 'On Hold' || statusUpdate === 'Dropped') && !statusReason.trim()) {
      alert('Please provide a reason for this status change.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate a reportId for upload validation
      const reportId = `RPT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      // Upload each attached file and collect real, openable URLs
      const uploadedUrls: string[] = [];
      for (const file of uploadedFiles) {
        try {
          const uploadData = await uploadFile({
            fileName: file.name,
            fileData: file.data,
            mimeType: file.type,
            taskId: task.TaskID,
            reportId: reportId
          });
          uploadedUrls.push(uploadData.webViewLink);
        } catch (uploadError: any) {
          console.error('Failed to upload file during report submission:', uploadError);
          const errorMessage = uploadError?.response?.data?.error || uploadError?.message || `Failed to upload ${file.name}`;
          alert(`Document upload failed: ${errorMessage}. Please remove the file and try again.`);
          setIsSubmitting(false);
          return; // Stop submission if any file upload fails
        }
      }

      // Merge uploaded file links with the manually typed attachment link
      const links = [...uploadedUrls];
      if (attachmentLink.trim()) {
        links.push(attachmentLink.trim());
      }
      const finalAttachmentLink = links.join(', ');

      // Simulate completion percentage mapping behind the scenes to preserve database schemas
      const simulatedPercent = statusUpdate === 'Closed' ? 100 : (statusUpdate === 'Submitted' ? 90 : (statusUpdate === 'Not Started' ? 0 : 50));

      onSubmit({
        TaskID: task.TaskID,
        SubtaskID: selectedSubtaskId || '',
        StatusUpdate: statusUpdate,
        WorkSummary: workSummary,
        PercentComplete: simulatedPercent,
        Blockers: blockers,
        NextAction: nextAction,
        AttachmentLink: finalAttachmentLink
      });

      // reset
      setWorkSummary('');
      setBlockers('');
      setNextAction('');
      setAttachmentLink('');
      setUploadedFiles([]);
      setSelectedSubtaskId('');
      setStatusReason('');
      onClose();
    } catch (err) {
      console.error('Error submitting report:', err);
      alert('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];

    // Convert each file to base64 for upload
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        const fileWithData = {
          name: file.name,
          type: file.type,
          data: base64Data,
          size: file.size
        };
        setUploadedFiles(prev => [...prev, fileWithData]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-xl overflow-hidden font-sans max-h-[90vh] sm:max-h-[85vh] flex flex-col"
      >
        <div className="bg-[#0F172A] px-4 sm:px-6 py-3 sm:py-4.5 flex items-center justify-between border-b border-[#1E293B]">
          <div className="flex-1 min-w-0">
            <span className="text-[8px] sm:text-[9px] bg-[#2563EB]/10 text-[#3B82F6] font-bold font-mono px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-[#2563EB]/25 tracking-wider">
              Append-Only Report
            </span>
            <h3 className="text-white font-bold text-sm sm:text-base tracking-tight mt-1 sm:mt-1.5 font-sans line-clamp-1">Submit Progress Report</h3>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="text-slate-400 hover:text-white transition-colors duration-150 cursor-pointer flex-shrink-0 ml-2 disabled:opacity-50 disabled:cursor-not-allowed">
            <X size={16} className="sm:size-[20px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-3 sm:space-y-4 flex-1 overflow-y-auto">
          <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg p-2.5 sm:p-3">
            <span className="text-[9px] sm:text-[10px] font-mono text-[#64748B] tracking-wider block font-bold">Active task</span>
            <span className="font-bold text-[#0F172A] text-xs sm:text-sm mt-0.5 block line-clamp-2">{task.Title}</span>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium">{task.TaskID}</span>
          </div>

          {showSubtaskSelector && (
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                Reporting against
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 p-2 bg-white border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="subtaskSelector"
                    value=""
                    checked={selectedSubtaskId === ''}
                    onChange={() => setSelectedSubtaskId('')}
                    className="h-4 w-4 text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <span className="text-xs text-slate-800 font-medium">Parent Task ({task.TaskID})</span>
                </label>
                {userSubtasks.map((subtask) => (
                  <label key={subtask.SubtaskID} className="flex items-center space-x-2 p-2 bg-white border border-[#E2E8F0] rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="subtaskSelector"
                      value={subtask.SubtaskID}
                      checked={selectedSubtaskId === subtask.SubtaskID}
                      onChange={() => setSelectedSubtaskId(subtask.SubtaskID)}
                      className="h-4 w-4 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <span className="text-xs text-slate-800 font-medium">Subtask: {subtask.Title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
              New task status
            </label>
            <select
              value={statusUpdate}
              onChange={(e) => setStatusUpdate(e.target.value as TaskStatus)}
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="In Progress">In Progress</option>
              <option value="Submitted">Submitted (Review Request)</option>
              <option value="On Hold">On Hold</option>
              <option value="Dropped">Dropped</option>
              <option value="Closed">Closed (Task Complete)</option>
            </select>
          </div>

          {(statusUpdate === 'On Hold' || statusUpdate === 'Dropped') && (
            <div>
              <label className="block text-[10px] font-bold text-red-600 tracking-wider mb-1">
                Reason for Status Change <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Please explain why this task is being put on hold or dropped..."
                className="w-full text-xs bg-white border border-red-200 rounded-lg p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500"
              ></textarea>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
              Work summary <span className="text-red-500">*</span>
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
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1 flex items-center space-x-1">
                <AlertTriangle size={12} className="text-amber-500" />
                <span>Active blockers (optional)</span>
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
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
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
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1 flex items-center space-x-1">
              <LinkIcon size={12} />
              <span>Attachment / deliverable URI (optional)</span>
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
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1 flex items-center space-x-1">
              <Upload size={12} />
              <span>Upload files / photos (optional)</span>
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
                <p className="text-[10px] font-bold text-[#64748B] tracking-wider">Uploaded files:</p>
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

          <div className="pt-3 sm:pt-4 border-t border-[#E2E8F0] flex items-center justify-end space-x-2 sm:space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 sm:px-4 py-1.5 sm:py-2 border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-[10px] sm:text-xs font-bold tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 sm:px-5 py-1.5 sm:py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-[10px] sm:text-xs font-bold tracking-wider transition-all shadow-sm flex items-center space-x-1.5 sm:space-x-2 cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={11} className="sm:size-[13px]" />
              <span className="hidden sm:inline">{isSubmitting ? 'Publishing...' : 'Publish report'}</span>
              <span className="sm:hidden">{isSubmitting ? '...' : 'Publish'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}