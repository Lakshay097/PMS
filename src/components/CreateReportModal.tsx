import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, Send, AlertTriangle, Link as LinkIcon, Upload, File, Image as ImageIcon,
  Loader2, PlayCircle, PauseCircle, XCircle, CheckCircle2,
} from 'lucide-react';
import { Task, TaskStatus, User as UserType, Subtask } from '../types';
import { uploadFile } from '../api/upload';

// The report form only offers these four outcomes. "Completed" is stored as
// the 'Closed' TaskStatus so nothing downstream (badges, overdue logic,
// reports) needs to change.
type ReportStatus = 'In Progress' | 'On Hold' | 'Dropped' | 'Completed';

const STATUS_TO_ENUM: Record<ReportStatus, TaskStatus> = {
  'In Progress': 'In Progress',
  'On Hold': 'On Hold',
  'Dropped': 'Dropped',
  'Completed': 'Closed',
};

const STATUS_OPTIONS: {
  value: ReportStatus;
  icon: React.ReactNode;
  active: string;   // classes when selected
  needsReason?: boolean;
}[] = [
  { value: 'In Progress', icon: <PlayCircle size={14} />, active: 'bg-blue-600 border-blue-600 text-white' },
  { value: 'On Hold', icon: <PauseCircle size={14} />, active: 'bg-amber-500 border-amber-500 text-white', needsReason: true },
  { value: 'Dropped', icon: <XCircle size={14} />, active: 'bg-red-600 border-red-600 text-white', needsReason: true },
  { value: 'Completed', icon: <CheckCircle2 size={14} />, active: 'bg-emerald-600 border-emerald-600 text-white' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface UploadedFile { name: string; type: string; data: string; size: number }

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
  // Map whatever the task's current status is into one of the four options.
  const initialStatus = useMemo<ReportStatus>(() => {
    if (task.Status === 'On Hold') return 'On Hold';
    if (task.Status === 'Dropped') return 'Dropped';
    if (task.Status === 'Closed' || task.Status === 'Reviewed') return 'Completed';
    return 'In Progress';
  }, [task.Status]);

  const [workSummary, setWorkSummary] = useState('');
  const [status, setStatus] = useState<ReportStatus>(initialStatus);
  const [percent, setPercent] = useState<number>(
    typeof task.PercentComplete === 'number' && task.PercentComplete > 0 ? task.PercentComplete : 50
  );
  const [blockers, setBlockers] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedSubtaskId, setSelectedSubtaskId] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const userSubtasks = useMemo(
    () => subtasks.filter(s => s.AssignedTo === currentUser.Email),
    [subtasks, currentUser.Email]
  );
  const showSubtaskSelector = subtasks.length > 0 && userSubtasks.length > 0;
  const reasonRequired = status === 'On Hold' || status === 'Dropped';

  // Effective percent — Completed and Dropped are fixed; the others use the slider.
  const effectivePercent = status === 'Completed' ? 100 : status === 'Dropped' ? 0 : percent;

  // Reset the form whenever the modal opens for a task.
  useEffect(() => {
    if (!isOpen) return;
    setStatus(initialStatus);
    setPercent(typeof task.PercentComplete === 'number' && task.PercentComplete > 0 ? task.PercentComplete : 50);
    setWorkSummary('');
    setBlockers('');
    setNextAction('');
    setAttachmentLink('');
    setUploadedFiles([]);
    setStatusReason('');
    setError('');
    setSelectedSubtaskId(userSubtasks.length === 1 ? userSubtasks[0].SubtaskID : '');
  }, [isOpen, initialStatus, task.PercentComplete, userSubtasks]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSubmitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSubmitting, onClose]);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const tooBig = files.filter(f => f.size > MAX_FILE_SIZE).map(f => f.name);
    if (tooBig.length) {
      setError(`These files exceed 10 MB and were skipped: ${tooBig.join(', ')}`);
    }
    const ok = files.filter(f => f.size <= MAX_FILE_SIZE);
    ok.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const data = e.target?.result as string;
        setUploadedFiles(prev =>
          // de-dupe by name + size
          prev.some(p => p.name === file.name && p.size === file.size)
            ? prev
            : [...prev, { name: file.name, type: file.type, data, size: file.size }]
        );
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []) as File[]);
    e.target.value = ''; // allow re-selecting the same file
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(Array.from(e.dataTransfer.files || []) as File[]);
  }, [addFiles]);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workSummary.trim()) {
      setError('Add a work summary before publishing.');
      return;
    }
    if (reasonRequired && !statusReason.trim()) {
      setError(`Add a reason for putting this task ${status === 'On Hold' ? 'on hold' : 'as dropped'}.`);
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const reportId = `RPT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uploadedUrls: string[] = [];
      for (const file of uploadedFiles) {
        try {
          const uploadData = await uploadFile({
            fileName: file.name,
            fileData: file.data,
            mimeType: file.type,
            taskId: task.TaskID,
            reportId,
          });
          uploadedUrls.push(uploadData.webViewLink);
        } catch (uploadError: any) {
          const msg = uploadError?.response?.data?.error || uploadError?.message || `Failed to upload ${file.name}`;
          setError(`Upload failed: ${msg}. Remove the file and try again.`);
          setIsSubmitting(false);
          return;
        }
      }

      const links = [...uploadedUrls];
      if (attachmentLink.trim()) links.push(attachmentLink.trim());

      // Persist the hold/drop reason. The report schema has no dedicated field,
      // so we fold it into the work summary as a labeled first line — this fixes
      // the old bug where the required reason was collected but never saved.
      const summary = reasonRequired
        ? `Reason for ${status}: ${statusReason.trim()}\n\n${workSummary.trim()}`
        : workSummary.trim();

      onSubmit({
        TaskID: task.TaskID,
        SubtaskID: selectedSubtaskId || '',
        StatusUpdate: STATUS_TO_ENUM[status],
        WorkSummary: summary,
        PercentComplete: effectivePercent,
        Blockers: blockers,
        NextAction: nextAction,
        AttachmentLink: links.join(', '),
      });
      onClose();
    } catch (err) {
      setError('Something went wrong publishing the report. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    workSummary, reasonRequired, statusReason, status, uploadedFiles, attachmentLink,
    task.TaskID, selectedSubtaskId, effectivePercent, blockers, nextAction, onSubmit, onClose,
  ]);

  if (!isOpen) return null;

  const fieldClass =
    'w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        role="dialog"
        aria-modal="true"
        aria-label="Submit progress report"
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-2xl overflow-hidden font-sans max-h-[90vh] sm:max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-[#0F172A] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-[#1E293B]">
          <div className="flex-1 min-w-0">
            <span className="text-[8px] sm:text-[9px] bg-[#2563EB]/10 text-[#3B82F6] font-bold font-mono px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-[#2563EB]/25 tracking-wider">
              Append-only report
            </span>
            <h3 className="text-white font-bold text-sm sm:text-base tracking-tight mt-1 sm:mt-1.5 line-clamp-1">Submit progress report</h3>
          </div>
          <button onClick={onClose} disabled={isSubmitting} aria-label="Close" className="text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-3 sm:space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-[11px] px-3 py-2 rounded-lg">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Subtask selector */}
          {showSubtaskSelector && (
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">Report for subtask (optional)</label>
              <select value={selectedSubtaskId} onChange={e => setSelectedSubtaskId(e.target.value)} className={fieldClass}>
                <option value="">Main task</option>
                {userSubtasks.map(sub => <option key={sub.SubtaskID} value={sub.SubtaskID}>{sub.Title}</option>)}
              </select>
            </div>
          )}

          {/* Status — segmented control */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1.5">Status</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUS_OPTIONS.map(opt => {
                const selected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    aria-pressed={selected}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-[11px] font-bold tracking-wide transition-all cursor-pointer ${
                      selected ? opt.active : 'bg-white border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.icon}
                    <span>{opt.value}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason — required for On Hold / Dropped */}
          {reasonRequired && (
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                Reason this task is {status === 'On Hold' ? 'on hold' : 'dropped'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={statusReason}
                onChange={e => setStatusReason(e.target.value)}
                placeholder={status === 'On Hold' ? 'e.g. Waiting on vendor confirmation' : 'e.g. Superseded by a newer request'}
                className={fieldClass}
              />
            </div>
          )}

          {/* Progress — slider for In Progress / On Hold, fixed otherwise */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-[#64748B] tracking-wider">Progress</label>
              <span className="text-xs font-bold text-slate-800">{effectivePercent}%</span>
            </div>
            {status === 'Completed' || status === 'Dropped' ? (
              <p className="text-[11px] text-slate-500 italic">
                {status === 'Completed' ? 'Marked complete — progress set to 100%.' : 'Dropped — progress recorded as 0%.'}
              </p>
            ) : (
              <input
                type="range" min={0} max={100} step={5}
                value={percent}
                onChange={e => setPercent(Number(e.target.value))}
                className="w-full accent-[#2563EB] cursor-pointer"
                aria-label="Percent complete"
              />
            )}
          </div>

          {/* Work summary */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">Work summary <span className="text-red-500">*</span></label>
            <textarea
              required rows={3} value={workSummary}
              onChange={e => setWorkSummary(e.target.value)}
              placeholder="What was done since the last update? Deliverables, decisions, and progress."
              className={fieldClass.replace('py-2', 'p-3')}
            />
          </div>

          {/* Blockers + Next action */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-[#64748B] tracking-wider mb-1 flex items-center gap-1">
                <AlertTriangle size={12} className="text-amber-500" /> Blockers (optional)
              </label>
              <input type="text" value={blockers} onChange={e => setBlockers(e.target.value)} placeholder="Anything holding this up" className={fieldClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">Next action (optional)</label>
              <input type="text" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="The immediate next step" className={fieldClass} />
            </div>
          </div>

          {/* Attachment link */}
          <div>
            <label className="text-[10px] font-bold text-[#64748B] tracking-wider mb-1 flex items-center gap-1">
              <LinkIcon size={12} /> Attachment link (optional)
            </label>
            <input type="url" value={attachmentLink} onChange={e => setAttachmentLink(e.target.value)} placeholder="https://…" className={fieldClass} />
          </div>

          {/* File upload with drag & drop */}
          <div>
            <label className="text-[10px] font-bold text-[#64748B] tracking-wider mb-1 flex items-center gap-1">
              <Upload size={12} /> Upload files or photos (optional)
            </label>
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 transition-colors ${dragActive ? 'border-[#2563EB] bg-blue-50' : 'border-[#E2E8F0]'}`}
            >
              <input type="file" multiple onChange={handleFileInput} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer">
                <Upload className="text-slate-400 mb-2" size={24} />
                <p className="text-xs text-slate-600 text-center">Drop files here or click to upload</p>
                <p className="text-[10px] text-slate-400 text-center mt-1">Images, PDFs, Office docs — up to 10 MB each</p>
              </label>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-slate-50 border border-[#E2E8F0] rounded-lg p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {file.type.startsWith('image/')
                        ? <img src={file.data} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        : <File className="text-slate-500 flex-shrink-0" size={16} />}
                      <span className="text-xs text-slate-700 truncate">{file.name}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`} className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 sm:pt-4 border-t border-[#E2E8F0] flex items-center justify-end gap-2 sm:gap-3">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-3 sm:px-4 py-1.5 sm:py-2 border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-[10px] sm:text-xs font-bold tracking-wider cursor-pointer disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 sm:px-5 py-1.5 sm:py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-[10px] sm:text-xs font-bold tracking-wider transition-all shadow-sm flex items-center gap-1.5 sm:gap-2 cursor-pointer border-none disabled:opacity-50">
              {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>{isSubmitting ? 'Publishing…' : 'Publish report'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}