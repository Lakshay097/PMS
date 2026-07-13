import React, { useState } from 'react';
import Drawer from '../shared/Drawer';
import StatusBadge from '../shared/StatusBadge';
import PriorityBadge from '../shared/PriorityBadge';
import TimelineItem from '../shared/TimelineItem';
import { Calendar, User, Clock, FileText, MessageSquare, CheckSquare, History, Paperclip, Send } from 'lucide-react';
import { Task, Subtask, Comment, TaskReport } from '../../types';

interface TaskDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  subtasks?: Subtask[];
  comments?: Comment[];
  reports?: TaskReport[];
  onUpdateStatus?: (status: Task['Status']) => void;
  onSubmitUpdate?: () => void;
}

type TabType = 'overview' | 'updates' | 'subtasks' | 'comments' | 'files' | 'history';

// Helper function to extract filename from URL
function getFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.split('/').pop();
    // If filename is empty or just a slash, use the full URL
    if (!fileName || fileName === '/') {
      return url;
    }
    // If filename doesn't have an extension, it might be a short URL, use full URL
    if (!fileName.includes('.')) {
      return url;
    }
    return fileName;
  } catch {
    return url;
  }
}

export default function TaskDetailDrawer({
  isOpen,
  onClose,
  task,
  subtasks = [],
  comments = [],
  reports = [],
  onUpdateStatus,
  onSubmitUpdate,
}: TaskDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [newComment, setNewComment] = useState('');
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());

  if (!task) return null;

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: <FileText size={16} /> },
    { id: 'updates' as TabType, label: 'Updates', icon: <Clock size={16} /> },
    { id: 'subtasks' as TabType, label: 'Subtasks', icon: <CheckSquare size={16} /> },
    { id: 'comments' as TabType, label: 'Comments', icon: <MessageSquare size={16} /> },
    { id: 'files' as TabType, label: 'Files', icon: <Paperclip size={16} /> },
    { id: 'history' as TabType, label: 'History', icon: <History size={16} /> },
  ];

  const handleAddComment = () => {
    if (newComment.trim()) {
      setNewComment('');
      // Handle comment submission
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="lg" position="right">
      {/* Drawer Header */}
      <div className="px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-2">{task.Title}</h2>
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>ID: {task.TaskID}</span>
              <span>•</span>
              <PriorityBadge priority={task.Priority} size="sm" />
              <StatusBadge status={task.Status} size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Metadata Strip */}
      <div className="px-6 py-3 border-b border-[var(--color-border)] bg-gray-50">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User size={14} className="text-muted" />
            <span className="text-muted">Assignee:</span>
            <span className="text-[#0f172a]">{task.AssignedToEmail}</span>
          </div>
          <div className="flex items-center gap-2">
            <User size={14} className="text-muted" />
            <span className="text-muted">Assigned by:</span>
            <span className="text-[#0f172a]">{task.AssignedByEmail}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted" />
            <span className="text-muted">Due:</span>
            <span className="text-[#0f172a]">{new Date(task.DueDate).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted" />
            <span className="text-muted">Start:</span>
            <span className="text-[#0f172a]">{new Date(task.StartDate).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 border-b border-[var(--color-border)]">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-muted hover:text-[#0f172a]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-[#0f172a] mb-2">Description</h3>
              <p className="text-sm text-muted whitespace-pre-wrap">{task.Description}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-[#0f172a] mb-2">Deliverable expectations</h3>
              <p className="text-sm text-muted">
                Complete the task according to the defined requirements and submit progress updates regularly.
              </p>
            </div>

            {task.AttachmentLink && (
              <div>
                <h3 className="text-sm font-medium text-[#0f172a] mb-2">Attachments</h3>
                <div className="space-y-1">
                  {task.AttachmentLink.split(',').map((link, idx) => {
                    const fileName = getFileNameFromUrl(link.trim());
                    return (
                      <a
                        key={idx}
                        href={link.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-[var(--color-accent)] hover:underline"
                      >
                        {fileName}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'updates' && (
          <div className="p-6 space-y-4">
            {reports.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">No progress updates yet</p>
            ) : (
              reports.map((report) => {
                const isExpanded = expandedReports.has(report.ReportID);
                return (
                  <div key={report.ReportID} className="p-4 bg-gray-50 rounded-lg">
                    <div 
                      className="flex items-start justify-between mb-2 cursor-pointer"
                      onClick={() => {
                        const newExpanded = new Set(expandedReports);
                        if (isExpanded) {
                          newExpanded.delete(report.ReportID);
                        } else {
                          newExpanded.add(report.ReportID);
                        }
                        setExpandedReports(newExpanded);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={report.StatusUpdate} size="sm" />
                        <span className="text-xs text-muted">
                          {new Date(report.ReportDate).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted">
                          by {report.SubmittedByEmail}
                        </span>
                      </div>
                      <span className="text-xs text-muted">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-[#0f172a]">{report.WorkSummary}</p>
                        {report.Blockers && (
                          <div className="text-sm text-danger">
                            <strong>Blocker:</strong> {report.Blockers}
                          </div>
                        )}
                        {report.NextAction && (
                          <div className="text-sm text-muted">
                            <strong>Next action:</strong> {report.NextAction}
                          </div>
                        )}
                        {report.AttachmentLink && (
                          <div className="text-sm">
                            <strong className="text-[#0f172a]">Attachments:</strong>
                            <div className="mt-1 space-y-1">
                              {report.AttachmentLink.split(',').map((link, idx) => {
                                const fileName = getFileNameFromUrl(link.trim());
                                return (
                                  <a
                                    key={idx}
                                    href={link.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-xs text-[var(--color-accent)] hover:underline"
                                  >
                                    {fileName}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'subtasks' && (
          <div className="p-6">
            {subtasks.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">No subtasks yet</p>
            ) : (
              <div className="space-y-2">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.SubtaskID}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <input
                      type="checkbox"
                      checked={subtask.Completed}
                      readOnly
                      className="w-4 h-4 rounded border-[var(--color-border)]"
                    />
                    <span className={`text-sm ${subtask.Completed ? 'line-through text-muted' : 'text-[#0f172a]'}`}>
                      {subtask.Title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {comments.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.CommentID} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[#0f172a]">{comment.CreatedBy}</span>
                      <span className="text-xs text-muted">
                        {new Date(comment.CreatedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-[#0f172a]">{comment.Comment}</p>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-[var(--color-border)]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="px-3 py-2 bg-[var(--color-accent)] text-white rounded-md hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="p-6">
            {task.AttachmentLink ? (
              <div className="p-4 bg-gray-50 rounded-lg">
                <a
                  href={task.AttachmentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[var(--color-accent)] hover:underline"
                >
                  <Paperclip size={16} />
                  <span>{task.AttachmentLink}</span>
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted text-center py-8">No files attached</p>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="p-6">
            <TimelineItem
              title="Task created"
              timestamp={new Date(task.CreatedAt).toLocaleString()}
              actor={task.AssignedByEmail}
              status="default"
            />
            <TimelineItem
              title="Task assigned"
              timestamp={new Date(task.CreatedAt).toLocaleString()}
              actor={task.AssignedByEmail}
              status="default"
            />
            {task.UpdatedAt !== task.CreatedAt && (
              <TimelineItem
                title="Task updated"
                timestamp={new Date(task.UpdatedAt).toLocaleString()}
                actor={task.AssignedByEmail}
                status="default"
              />
            )}
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="px-6 py-4 border-t border-[var(--color-border)] bg-gray-50">
        <div className="flex gap-2">
          {onSubmitUpdate && (
            <button
              onClick={onSubmitUpdate}
              className="flex-1 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Submit update
            </button>
          )}
          {task.Status !== 'Closed' && onUpdateStatus && (
            <button
              onClick={() => onUpdateStatus('Closed')}
              className="px-4 py-2 bg-[var(--color-success)] text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors"
            >
              Mark complete
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
