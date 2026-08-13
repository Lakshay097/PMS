import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllSubordinates } from '../../../utils/userUtils';
import { isTeamLeader, isSubTeamLeader } from '../../../utils/subTeamUtils';
import { generateReportWithAttachments, AttachmentInfo } from '../../../utils/pdfGenerator';
import { getTeamTasksScope, splitEmails, getUserRoles } from '../../../utils/roleUtils';
import {
  Calendar,
  Search,
  Filter,
  Download,
  Link,
  ChevronDown,
  CheckCircle,
  X,
} from 'lucide-react';
import { Task, User as UserType, TaskReport, Team, SubTeam, AppSetting } from '../../../types';
import { ROLE, isAdminLevel } from '../../../constants/status';
import MultiselectDropdown from '../../shared/MultiselectDropdown';
import BulkActionBar from '../../shared/BulkActionBar';
import { useRowSelection } from '../../../hooks/useRowSelection';
import ReportExportModal from '../../ReportExportModal';
import { getVisibleReports } from '../../../utils/taskUtils';

interface ReportsProps {
  tasks: Task[];
  currentUser: UserType;
  users?: UserType[];
  teams?: Team[];
  subTeams?: SubTeam[];
  reports?: TaskReport[];
  settings?: AppSetting[];
  isDarkMode?: boolean;
}

export default function Reports({
  tasks,
  currentUser,
  users = [],
  teams = [],
  subTeams = [],
  reports = [],
  settings = [],
  isDarkMode = false,
}: ReportsProps) {
  // State for reports view
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeamIDs, setFilterTeamIDs] = useState<string[]>([]);
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const allStatuses = ['In Progress', 'Submitted', 'Closed', 'Overdue', 'On Hold', 'Dropped', 'Not Started'];
  const [filterStatus, setFilterStatus] = useState<string[]>(allStatuses);
  const [showFlatView, setShowFlatView] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [dateFilteredReports, setDateFilteredReports] = useState<TaskReport[]>([]);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Compute user roles once per render
  const userRoles = useMemo(() => {
    return getUserRoles(currentUser, teams || [], subTeams || [], settings || []);
  }, [currentUser, teams, subTeams, settings]);

  // Status dropdown click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle status function with same behavior as TaskFilters (Excel-style)
  const toggleStatus = (status: string) => {
    if (status === 'All') {
      // When "All" is clicked: if all are selected, deselect all; otherwise select all
      const isAllSelected = allStatuses.every(s => filterStatus.includes(s));
      if (isAllSelected) {
        setFilterStatus([]);
      } else {
        setFilterStatus(allStatuses);
      }
    } else {
      // Toggle individual status
      if (filterStatus.includes(status)) {
        const newStatuses = filterStatus.filter(s => s !== status);
        setFilterStatus(newStatuses);
      } else {
        setFilterStatus([...filterStatus, status]);
      }
    }
  };

  // Compute filtered reports when dependencies change
  useEffect(() => {
    if (!reports || reports.length === 0) {
      setDateFilteredReports([]);
      return;
    }

    if (!currentUser) {
      setDateFilteredReports([]);
      return;
    }

    // First apply role-based visibility filter
    const roleFilteredReports = getVisibleReports(reports, currentUser, tasks || [], users || [], teams || [], subTeams || [], settings || []);

    // Show all reports regardless of task status for better visibility
    const taskReports = roleFilteredReports.filter(r => {
      const task = tasks?.find(t => t.TaskID === r.TaskID);
      return task !== undefined; // Only filter out reports with no associated task
    });

    // Apply team filter to reports
    const teamFilteredReports = filterTeamIDs.length > 0
      ? taskReports.filter(r => {
        const task = tasks?.find(t => t.TaskID === r.TaskID);
        return task && filterTeamIDs.some(teamId =>
          task.AssignedToTeamIDs?.includes(teamId) || task.TeamID === teamId
        );
      })
      : taskReports;

    // Apply stakeholder/assignee filter to reports
    const assigneeFilteredReports = filterAssignee.length > 0
      ? teamFilteredReports.filter(r => {
        const task = tasks?.find(t => t.TaskID === r.TaskID);
        return task && filterAssignee.some(email =>
          task.AssignedToEmail?.toLowerCase().includes(email.toLowerCase()) ||
          task.AssignedByEmail?.toLowerCase() === email.toLowerCase() ||
          r.SubmittedByEmail?.toLowerCase() === email.toLowerCase()
        );
      })
      : teamFilteredReports;

    // Apply status filter to reports
    const statusFilteredReports = filterStatus.length > 0 && !filterStatus.includes('All')
      ? assigneeFilteredReports.filter(r => {
        const task = tasks?.find(t => t.TaskID === r.TaskID);
        return task && filterStatus.includes(task.Status);
      })
      : assigneeFilteredReports;

    // Apply date range filter to reports
    const newDateFilteredReports = statusFilteredReports.filter(r => {
      if (filterDateFrom && r.ReportDate < filterDateFrom) return false;
      if (filterDateTo && r.ReportDate > filterDateTo) return false;
      return true;
    });

    setDateFilteredReports(newDateFilteredReports);
  }, [reports, tasks, filterTeamIDs, filterAssignee, filterStatus, filterDateFrom, filterDateTo, currentUser, users, teams, subTeams]);

  // Row selection for reports
  const {
    selectedIds: selectedReportIds,
    selectedCount: selectedReportCount,
    allSelected: allReportsSelected,
    someSelected: someReportsSelected,
    toggleSelection: toggleReportSelection,
    toggleSelectAll: toggleSelectAllReports,
    clearSelection: clearReportSelection,
    isSelected: isReportSelected,
  } = useRowSelection<TaskReport>({
    items: dateFilteredReports,
    getItemId: (report) => report.ReportID,
  });

  // Helper function to extract filename from URL
  const getFileNameFromUrl = (url: string): string => {
    try {
      if (url.includes('drive.google.com')) {
        const urlObj = new URL(url);
        const filename = urlObj.searchParams.get('filename') || urlObj.searchParams.get('name');
        if (filename) return filename;
      }

      const pathname = new URL(url).pathname;
      const parts = pathname.split('/');
      const lastPart = parts[parts.length - 1];

      if (lastPart) {
        const cleanName = lastPart.split('?')[0];
        const decoded = decodeURIComponent(cleanName);
        return decoded;
      }

      return 'Attachment';
    } catch (error) {
      return 'Attachment';
    }
  };

  // Get team members based on user role with hierarchical visibility
  const getTeamMembers = () => {
    if (!currentUser) return [];
    if (isAdminLevel(currentUser.Role)) {
      return users || [];
    } else if (currentUser.Role === ROLE.STAKEHOLDER) {
      const subordinateEmails = getAllSubordinates(currentUser.Email, users || []);
      return (users || []).filter(u =>
        u.Email === currentUser.Email ||
        subordinateEmails.includes(u.Email)
      );
    } else {
      return (users || []).filter(u => u.Email === currentUser.Email);
    }
  };

  const getFileTypeFromUrl = (url: string): string => {
    if (url.includes('.pdf')) return 'application/pdf';
    if (url.includes('.doc') || url.includes('.docx')) return 'application/msword';
    if (url.includes('.xls') || url.includes('.xlsx')) return 'application/vnd.ms-excel';
    if (url.match(/\.(jpg|jpeg|png|gif)$/i)) return 'image/jpeg';
    if (url.includes('.mp4') || url.includes('.mov')) return 'video/mp4';
    return 'application/octet-stream';
  };

  const handleDownloadReportWithAttachments = async (taskId: string) => {
    setIsGeneratingPdf(true);
    try {
      const task = tasks?.find(t => t.TaskID === taskId);
      const taskReports = reports?.filter(r => r.TaskID === taskId);

      if (!task || !taskReports || taskReports.length === 0) {
        setIsGeneratingPdf(false);
        return;
      }

      let reportContent = `Task: ${task.Title}\n`;
      reportContent += `Task ID: ${task.TaskID}\n`;
      reportContent += `Status: ${task.Status}\n`;
      reportContent += `Priority: ${task.Priority}\n`;
      reportContent += `Due Date: ${task.DueDate}\n`;
      reportContent += `Assigned To: ${task.AssignedToEmail}\n\n`;

      taskReports.forEach((report, index) => {
        reportContent += `--- Report ${index + 1} ---\n`;
        reportContent += `Submitted By: ${report.SubmittedByEmail}\n`;
        reportContent += `Date: ${report.ReportDate}\n`;
        reportContent += `Status: ${report.StatusUpdate}\n`;
        reportContent += `Progress: ${report.PercentComplete}%\n\n`;
        reportContent += `Work Summary:\n${report.WorkSummary}\n\n`;
        if (report.Blockers) {
          reportContent += `Blockers:\n${report.Blockers}\n\n`;
        }
        if (report.NextAction) {
          reportContent += `Next Action:\n${report.NextAction}\n\n`;
        }
      });

      const attachments: AttachmentInfo[] = [];
      taskReports.forEach(report => {
        if (report.AttachmentLink) {
          const links = report.AttachmentLink.split(',').map(l => l.trim()).filter(l => l);
          links.forEach((link, idx) => {
            const fileName = `attachment-${idx + 1}`;
            const fileType = getFileTypeFromUrl(link);
            attachments.push({
              url: link,
              name: fileName,
              type: fileType
            });
          });
        }
      });

      const pdfBlob = await generateReportWithAttachments(
        reportContent,
        attachments,
        `Report-${task.TaskID}-${task.Title.replace(/[^a-zA-Z0-9]/g, '-')}`
      );

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report-${task.TaskID}-${task.Title.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Bulk download handler
  const handleBulkDownload = async () => {
    for (const reportId of selectedReportIds) {
      const report = dateFilteredReports.find(r => r.ReportID === reportId);
      if (report) {
        await handleDownloadReportWithAttachments(report.TaskID);
      }
    }
    clearReportSelection();
  };

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  if (!reports || reports.length === 0) {
    return (
      <div className="space-y-6">
        <div className="border rounded-xl p-6 bg-surface border-token">
          <div className={`p-12 text-center text-muted`}>
            No reports found
          </div>
        </div>
      </div>
    );
  }

  const taskReports = reports.filter(r => {
    const task = tasks?.find(t => t.TaskID === r.TaskID);
    return !!task;
  });

  const teamFilteredReports = filterTeamIDs.length > 0
    ? taskReports.filter(r => {
      const task = tasks?.find(t => t.TaskID === r.TaskID);
      return task && filterTeamIDs.some(teamId =>
        task.AssignedToTeamIDs?.includes(teamId) || task.TeamID === teamId
      );
    })
    : taskReports;

  const assigneeFilteredReports = filterAssignee.length > 0
    ? teamFilteredReports.filter(r => {
      const task = tasks?.find(t => t.TaskID === r.TaskID);
      return task && filterAssignee.some(email =>
        task.AssignedToEmail?.toLowerCase().includes(email.toLowerCase()) ||
        task.AssignedByEmail?.toLowerCase() === email.toLowerCase() ||
        r.SubmittedByEmail?.toLowerCase() === email.toLowerCase()
      );
    })
    : teamFilteredReports;

  const newDateFilteredReports = assigneeFilteredReports.filter(r => {
    if (filterDateFrom && r.ReportDate < filterDateFrom) return false;
    if (filterDateTo && r.ReportDate > filterDateTo) return false;
    return true;
  });

  const reportsByTask = new Map<string, { task: Task | undefined, reports: TaskReport[] }>();
  newDateFilteredReports.forEach(report => {
    const task = tasks?.find(t => t.TaskID === report.TaskID);
    if (!reportsByTask.has(report.TaskID)) {
      reportsByTask.set(report.TaskID, { task, reports: [] });
    }
    reportsByTask.get(report.TaskID)!.reports.push(report);
  });
  
  const filteredTasks = Array.from(reportsByTask.entries()).filter(([taskId, { task }]) => {
    if (!searchQuery) return true;
    if (!task) return false;
    return (
      (task.Title && task.Title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (task.TaskID && task.TaskID.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (task.AssignedToEmail && task.AssignedToEmail.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  const latestReportIdByTask = new Map<string, string>();
  newDateFilteredReports.forEach(r => {
    const currentId = latestReportIdByTask.get(r.TaskID);
    const current = currentId ? newDateFilteredReports.find(x => x.ReportID === currentId) : null;
    if (!current || r.ReportDate > current.ReportDate) {
      latestReportIdByTask.set(r.TaskID, r.ReportID);
    }
  });

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 border rounded-xl p-6 bg-surface border-token">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-lg text-primary">Progress Reports</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFlatView(!showFlatView)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${!showFlatView
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'text-secondary hover:text-white'
                    : 'text-secondary hover:text-slate-900'
                }`}
            >
              {showFlatView ? 'Grouped View' : 'Flat View'}
            </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Download size={16} />
                Download Report
              </button>
          </div>
        </div>

        <div className="border border-token bg-surface rounded-xl p-4 flex flex-wrap gap-4 items-center mb-6">
          <div className="flex items-center space-x-2 text-sm text-muted">
            <Filter size={16} />
            <span>Filters:</span>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-muted sm:size-4" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface border-token text-primary placeholder-muted"
            />
          </div>

          {/* Status Filter */}
          <div className="relative" ref={statusDropdownRef}>
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <Filter size={14} />
              <span>Status</span>
              {(() => {
                const isAllSelected = allStatuses.every(s => filterStatus.includes(s));
                if (filterStatus.length > 0 && !isAllSelected) {
                  return (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      isDarkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {filterStatus.length}
                    </span>
                  );
                }
                return null;
              })()}
              <ChevronDown size={12} className={`transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isStatusDropdownOpen && (
              <div className={`absolute top-full left-0 mt-2 w-56 rounded-lg shadow-lg z-50 ${isDarkMode ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-[#E5E7EB]'}`}>
                <div className="max-h-60 overflow-y-auto p-2">
                  {['All', 'In Progress', 'Submitted', 'Closed', 'Overdue', 'On Hold', 'Dropped', 'Not Started'].map(status => {
                    const isAllSelected = allStatuses.every(s => filterStatus.includes(s));
                    const isIndeterminate = filterStatus.length > 0 && !isAllSelected;
                    
                    return (
                      <label
                        key={status}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${isDarkMode ? 'text-slate-200 hover:bg-[#334155]/60' : 'text-slate-800 hover:bg-slate-100'}`}
                      >
                        <input
                          type="checkbox"
                          ref={input => {
                            if (input && status === 'All') {
                              input.indeterminate = isIndeterminate;
                            }
                          }}
                          checked={status === 'All' ? isAllSelected : filterStatus.includes(status)}
                          onChange={() => toggleStatus(status)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="flex-1 text-sm">{status}</span>
                      </label>
                    );
                  })}
                </div>

                <div className={`p-2 border-t ${isDarkMode ? 'border-[#334155]' : 'border-[#E5E7EB]'}`}>
                  <button
                    onClick={() => setFilterStatus(allStatuses)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${isDarkMode ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
                  >
                    <X size={12} />
                    Select all
                  </button>
                </div>
              </div>
            )}
          </div>

          <MultiselectDropdown
            label="Teams"
            options={teams.filter(t => t.Active).map(team => ({ value: team.TeamID, label: team.TeamName }))}
            selectedValues={filterTeamIDs}
            onSelectionChange={setFilterTeamIDs}
            isDarkMode={isDarkMode}
            badgeColor="emerald"
          />

          <MultiselectDropdown
            label="Stakeholders"
            options={getTeamMembers().filter(u => u.Active).map(user => ({ value: user.Email, label: user.FullName }))}
            selectedValues={filterAssignee}
            onSelectionChange={setFilterAssignee}
            isDarkMode={isDarkMode}
            showSearch={true}
            badgeColor="blue"
          />

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
              <Calendar size={16} className={isDarkMode ? 'text-secondary' : 'text-slate-500'} />
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className={`bg-transparent focus:outline-none text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                placeholder="From"
              />
            </div>
            <span className={isDarkMode ? 'text-secondary' : 'text-slate-500'}>to</span>
            <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
              <Calendar size={16} className={isDarkMode ? 'text-secondary' : 'text-slate-500'} />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className={`bg-transparent focus:outline-none text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                placeholder="To"
              />
            </div>
          </div>

          {(filterTeamIDs.length > 0 || filterDateFrom || filterDateTo || filterStatus.length > 0) && (
            <button
              onClick={() => {
                setFilterTeamIDs([]);
                setFilterDateFrom('');
                setFilterDateTo('');
                setFilterStatus(allStatuses);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${isDarkMode
                  ? 'text-secondary hover:text-white hover:bg-[#334155]/50'
                  : 'text-secondary hover:text-primary hover:bg-slate-100'
                }`}
            >
              Clear Filters
            </button>
          )}
        </div>

        {showFlatView ? (
          <div className="space-y-3">
            {newDateFilteredReports.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-[#1E293B] rounded-t-lg border-b border-slate-200 dark:border-[#334155]">
                <input
                  type="checkbox"
                  checked={allReportsSelected}
                  ref={input => {
                    if (input) input.indeterminate = someReportsSelected;
                  }}
                  onChange={toggleSelectAllReports}
                  className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm text-muted">Select all reports</span>
              </div>
            )}
            {newDateFilteredReports.length > 0 ? (
              newDateFilteredReports.map((report) => {
                const task = tasks?.find(t => t.TaskID === report.TaskID);
                if (!task) return null;

                const showCloseRemark = !!task.CloseRemark && latestReportIdByTask.get(task.TaskID) === report.ReportID;

                return (
                  <div
                    key={report.ReportID}
                    className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isReportSelected(report.ReportID)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleReportSelection(report.ReportID);
                        }}
                        className="w-4 h-4 mt-1 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className={`text-xs font-mono mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>
                              Report ID: {report.ReportID || 'N/A'}
                            </div>
                            <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              Submitted by: {report.SubmittedByEmail || 'Unknown'}
                            </div>
                            <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              Date: {report.ReportDate || 'N/A'}
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded border ${task.Status === 'Closed' || task.Status === 'Reviewed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                              task.Status === 'In Progress' || task.Status === 'Submitted' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                task.Status === 'Not Started' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                                  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                            {task.Status || 'Unknown'}
                          </span>
                        </div>
                        <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Work summary</div>
                          <p className="text-sm">{report.WorkSummary || 'No work summary provided'}</p>
                        </div>
                        {report.Blockers && (
                          <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Blockers</div>
                            <p className="text-sm">{report.Blockers}</p>
                          </div>
                        )}
                        {report.NextAction && (
                          <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Next action</div>
                            <p className="text-sm">{report.NextAction}</p>
                          </div>
                        )}
                        {report.AttachmentLink && (
                          <div className="space-y-1">
                            {report.AttachmentLink.split(',').map((url, idx) => {
                              const trimmedUrl = url.trim();
                              return (
                                <div key={idx} className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                  <a href={trimmedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                    <Link size={14} />
                                    <span>{getFileNameFromUrl(trimmedUrl)}</span>
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {showCloseRemark && (
                          <div className={`mt-3 rounded-lg border p-3 ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                            <div className={`flex items-center gap-1.5 text-[11px] font-bold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                              <CheckCircle size={13} />
                              <span>Closing remark — {task.Title}</span>
                              {task.CompletionDate && (
                                <span className={`font-normal ${isDarkMode ? 'text-emerald-400/70' : 'text-emerald-600'}`}>· {task.CompletionDate}</span>
                              )}
                            </div>
                            <p className={`mt-1 text-xs leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                              {task.CloseRemark}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`p-12 text-center text-muted`}>No reports found</div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.length > 0 ? (
              filteredTasks.map(([taskId, { task, reports: taskReports }]) => {
                if (!task) return null;
                const isExpanded = expandedTaskIds.has(taskId);
                return (
                  <div key={taskId} className={`border rounded-lg ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                    <button
                      onClick={() => toggleTaskExpansion(taskId)}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex-1 text-left">
                        <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{task.Title || 'Untitled Task'}</h4>
                        <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>
                          <span>Task: {task.TaskID || 'N/A'}</span>
                          <span>Due: {task.DueDate || 'N/A'}</span>
                          <span>{taskReports.length} report{taskReports.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded border ${task.Status === 'Closed' || task.Status === 'Reviewed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            task.Status === 'In Progress' || task.Status === 'Submitted' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              task.Status === 'Not Started' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                                'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          }`}>
                          {task.Status || 'Unknown'}
                        </span>
                        <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {task?.CloseRemark && (
                      <div className={`mt-3 rounded-lg border p-3 ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className={`flex items-center gap-1.5 text-[11px] font-bold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                          <CheckCircle size={13} />
                          <span>Closing remark</span>
                          {task.CompletionDate && (
                            <span className={`font-normal ${isDarkMode ? 'text-emerald-400/70' : 'text-emerald-600'}`}>· {task.CompletionDate}</span>
                          )}
                        </div>
                        <p className={`mt-1 text-xs leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                          {task.CloseRemark}
                        </p>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="p-4 pt-0 space-y-3">
                        {taskReports.map((report) => (
                          <div
                            key={report.ReportID}
                            className="border rounded-lg p-4 bg-surface border-token"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="text-xs font-mono mb-1 text-muted">
                                  Report ID: {report.ReportID || 'N/A'}
                                </div>
                                <div className="text-sm text-secondary">
                                  Submitted by: {report.SubmittedByEmail || 'Unknown'}
                                </div>
                                <div className="text-sm text-secondary">
                                  Date: {report.ReportDate || 'N/A'}
                                </div>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded border ${task.Status === 'Closed' || task.Status === 'Reviewed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                  task.Status === 'In Progress' || task.Status === 'Submitted' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                    task.Status === 'Not Started' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                                      'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                }`}>
                                {task.Status || 'Unknown'}
                              </span>
                            </div>
                            <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                              <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Work summary</div>
                              <p className="text-sm">{report.WorkSummary || 'No work summary provided'}</p>
                            </div>
                            {report.Blockers && (
                              <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Blockers</div>
                                <p className="text-sm">{report.Blockers}</p>
                              </div>
                            )}
                            {report.NextAction && (
                              <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Next action</div>
                                <p className="text-sm">{report.NextAction}</p>
                              </div>
                            )}
                            {report.AttachmentLink && (
                              <div className="space-y-1">
                                {report.AttachmentLink.split(',').map((url, idx) => {
                                  const trimmedUrl = url.trim();
                                  return (
                                    <div key={idx} className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                      <a href={trimmedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                        <Link size={14} />
                                        <span>{getFileNameFromUrl(trimmedUrl)}</span>
                                      </a>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={`p-12 text-center text-muted`}>No reports found</div>
            )}
          </div>
        )}

        <BulkActionBar
          selectedCount={selectedReportCount}
          actions={[]}
          onClear={clearReportSelection}
        />
      </div>
      <ReportExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        tasks={tasks || []}
        reports={getVisibleReports(reports || [], currentUser)}
        users={users}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
