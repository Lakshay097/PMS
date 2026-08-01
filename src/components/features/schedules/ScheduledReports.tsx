import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { isAdminLevel } from '../../../constants/status';
import { uploadFile } from '../../../api/upload';
import { sendProofEmail } from '../../../api/teamReminder';
import { Task, User as UserType, Team, SubTeam, TeamSubmission, AppSetting } from '../../../types';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  Users,
  User,
  Plus,
  X,
  Link,
  Upload,
  File,
  Loader2,
  Download,
  AlertTriangle,
} from 'lucide-react';

interface ScheduledReportsProps {
  tasks: Task[];
  currentUser: UserType;
  users?: UserType[];
  teams?: Team[];
  subTeams?: SubTeam[];
  teamSubmissions?: TeamSubmission[];
  settings?: AppSetting[];
  onAddTeamSubmission?: (submission: TeamSubmission) => void;
}

export default function ScheduledReports({
  tasks,
  currentUser,
  users = [],
  teams = [],
  subTeams = [],
  teamSubmissions = [],
  settings = [],
  onAddTeamSubmission,
}: ScheduledReportsProps) {
  const { isDarkMode } = useTheme();
  // Scheduled Tasks submission state
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [submissionTeamId, setSubmissionTeamId] = useState<string | null>(null);
  const [submissionSubTeamId, setSubmissionSubTeamId] = useState<string | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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

  // Handle file upload for team submission
  const handleSubmissionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newUploadedFiles: Array<{ name: string; type: string; data: string }> = [];

    for (const file of files) {
      try {
        const reader = new FileReader();
        const data = await new Promise<string>((resolve, reject) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newUploadedFiles.push({
          name: file.name,
          type: file.type,
          data
        });
      } catch (error) {
      }
    }

    setSubmissionFiles(prev => [...prev, ...newUploadedFiles]);
  };

  const removeSubmissionFile = (index: number) => {
    setSubmissionFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle team submission
  const handleTeamSubmission = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!submissionTeamId || (!submissionNote.trim() && submissionFiles.length === 0)) {
      setSubmissionError('Please provide a note or upload at least one file');
      setTimeout(() => setSubmissionError(null), 3000);
      return;
    }

    // Permission check: sub-team leaders can only submit for their own sub-team
    if (submissionSubTeamId) {
      const subTeam = subTeams.find(st => st.SubTeamID === submissionSubTeamId);
      const isSubTeamLeader = subTeam?.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
      const team = teams.find(t => t.TeamID === submissionTeamId);
      const isTeamLeader = team?.TeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
      if (!currentUser || (!isSubTeamLeader && !isTeamLeader && !isAdminLevel(currentUser.Role))) {
        setSubmissionError('You can only submit reports for your own sub-team');
        setTimeout(() => setSubmissionError(null), 3000);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const submissionId = `SUB-${Math.floor(Math.random() * 10000)}`;

      // Upload files if any
      let attachmentLinks = '';
      if (submissionFiles.length > 0) {
        const uploadedUrls: string[] = [];

        for (const file of submissionFiles) {
          try {
            const uploadResult = await uploadFile({
              fileName: file.name,
              fileData: file.data,
              mimeType: file.type,
              teamId: submissionTeamId,
              submissionId: submissionId,
            });
            uploadedUrls.push(uploadResult.webViewLink);
          } catch (error: any) {
            const errorMessage = error?.response?.data?.error || error?.message || `Failed to upload ${file.name}`;
            setSubmissionError(errorMessage);
            setIsSubmitting(false);
            return;
          }
        }

        if (uploadedUrls.length > 0) {
          attachmentLinks = uploadedUrls.join(',');
        }
      }

      // Create submission
      const newSubmission: TeamSubmission = {
        SubmissionID: submissionId,
        TeamID: submissionTeamId,
        SubTeamID: submissionSubTeamId || undefined,
        SubmittedBy: currentUser.Email,
        SubmittedAt: new Date().toISOString(),
        Note: submissionNote.trim() || undefined,
        AttachmentLinks: attachmentLinks || undefined,
      };

      if (onAddTeamSubmission) {
        onAddTeamSubmission(newSubmission);
      }

      // Send proof email with threading
      try {
        const team = teams.find(t => t.TeamID === submissionTeamId);
        const teamName = team?.TeamName || 'Unknown Team';

        // Get leader emails
        let leaderEmails: string[] = [];
        if (submissionSubTeamId) {
          const subTeam = subTeams?.find(st => st.SubTeamID === submissionSubTeamId);
          leaderEmails = subTeam?.SubTeamLeaderEmails || [];
          if (leaderEmails.length === 0) {
            leaderEmails = team?.TeamLeaderEmails || [];
          }
        } else {
          leaderEmails = team?.TeamLeaderEmails || [];
        }

        if (leaderEmails.length > 0) {
          const subTeamName = submissionSubTeamId
            ? subTeams?.find(st => st.SubTeamID === submissionSubTeamId)?.SubTeamName
            : undefined;

          await sendProofEmail({
            teamId: submissionTeamId,
            subTeamId: submissionSubTeamId,
            teamName,
            subTeamName,
            leaderEmails,
            attachmentLinks: attachmentLinks || '',
            note: submissionNote.trim() || undefined,
            submittedBy: currentUser.Email
          });
        }
      } catch (emailError) {
      }

      // Reset state
      setSubmissionNote('');
      setSubmissionFiles([]);
      setSubmissionSuccess(true);
      setTimeout(() => setSubmissionSuccess(false), 3000);
      setSubmissionModalOpen(false);
      setSubmissionTeamId(null);
      setSubmissionSubTeamId(null);

    } catch (error) {
      setSubmissionError('Failed to submit report. Please try again.');
      setTimeout(() => setSubmissionError(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter teams based on user role - Admin sees all, Team Leader or Stakeholder see their own
  // Sub-team leaders can also see their parent teams
  const visibleTeams = currentUser && isAdminLevel(currentUser.Role)
    ? teams.filter(t => t.Active)
    : currentUser ? teams.filter(t => {
      if (!t.Active) return false;
      const isTeamLeader = t.TeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
      const isStakeholder = t.StakeholderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
      // Check if user is a sub-team leader for any sub-team within this team
      const teamSubTeams = subTeams?.filter(st => st.TeamID === t.TeamID) || [];
      const isSubTeamLeader = teamSubTeams.some(st =>
        st.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase())
      );
      return isTeamLeader || isStakeholder || isSubTeamLeader;
    }) : [];

  // Get unsubmitted teams from settings (for Admin dashboard visibility on Saturday)
  const unsubmittedTeamsSetting = settings.find(s => s.Key === 'unsubmitted_teams_this_week');
  const unsubmittedTeamIds = unsubmittedTeamsSetting?.Value ? unsubmittedTeamsSetting.Value.split(',').filter(Boolean) : [];

  // Filter out teams that have submitted (even late) from the unsubmitted list
  const submittedTeamIds = new Set(teamSubmissions.map(s => s.TeamID));
  const unsubmittedTeams = teams.filter(t =>
    unsubmittedTeamIds.includes(t.TeamID) && !submittedTeamIds.has(t.TeamID)
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="sticky top-0 z-10 border rounded-xl p-4 sm:p-6 bg-surface border-token">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h3 className="font-semibold text-base sm:text-lg text-primary">Scheduled Reports</h3>
            <p className="text-xs sm:text-sm text-muted">
              Weekly report submissions by team
            </p>
          </div>
          {submissionSuccess && (
            <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-emerald-500/10 text-emerald-400">
              Report submitted successfully!
            </div>
          )}
        </div>

        {/* Admin-only: Show unsubmitted teams warning on Saturday */}
        {currentUser && isAdminLevel(currentUser.Role) && unsubmittedTeams.length > 0 && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg border bg-amber-500/10 border-amber-500/30">
            <div className="flex items-start gap-2 sm:gap-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-xs sm:text-sm text-amber-300">
                  Unsubmitted Weekly Reports
                </h4>
                <p className="text-[10px] sm:text-xs mt-1 text-amber-400/80">
                  The following teams have not submitted their weekly report by Friday EOD:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                  {unsubmittedTeams.map(team => (
                    <span key={team.TeamID} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-amber-500/20 text-amber-300">
                      {team.TeamName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {visibleTeams.length === 0 ? (
          <div className={`p-8 sm:p-12 text-center text-sm ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>
            {currentUser && isAdminLevel(currentUser.Role) ? 'No teams available' : 'You are not assigned as a team leader to any team'}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {visibleTeams.map(team => {
              const teamMembers = users.filter(u => u.TeamIDs.includes(team.TeamID));
              const userIsTeamLeader = team.TeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
              // Check if user is a sub-team leader for any sub-team within this team
              const teamSubTeams = subTeams?.filter(st => st.TeamID === team.TeamID && st.Active) || [];
              const userIsSubTeamLeader = teamSubTeams.some(st =>
                st.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase())
              );
              const canPost = userIsTeamLeader || userIsSubTeamLeader || (currentUser && isAdminLevel(currentUser.Role));
              const filteredSubmissions = teamSubmissions
                .filter(s => s.TeamID === team.TeamID && !s.SubTeamID)
                .sort((a, b) => new Date(b.SubmittedAt).getTime() - new Date(a.SubmittedAt).getTime());

              return (
                <div key={team.TeamID} className={`border rounded-xl p-3 sm:p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                        <Users size={14} className={`shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      </div>
                      <div className="min-w-0">
                        <h4 className={`font-medium text-sm sm:text-base truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{team.TeamName}</h4>
                        <p className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>
                          {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {canPost && (
                      <button
                        onClick={() => {
                          setSubmissionTeamId(team.TeamID);
                          setSubmissionSubTeamId(null);
                          setSubmissionModalOpen(true);
                        }}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                      >
                        <Plus size={12} className="shrink-0" />
                        <span>Submit report</span>
                      </button>
                    )}
                  </div>

                  {/* Thread */}
                  <div className={`border-t pt-3 sm:pt-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                    {filteredSubmissions.length === 0 ? (
                      <div className={`p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-[#0F141F]' : 'bg-surface'}`}>
                        <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-secondary' : 'text-slate-500'} text-center`}>
                          No submissions yet for this team
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {filteredSubmissions.map(submission => {
                          const submitter = users.find(u => u.Email === submission.SubmittedBy);
                          return (
                            <div key={submission.SubmissionID} className={`p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-[#0F141F]' : 'bg-surface'}`}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                                    <User size={12} className={`shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`text-xs sm:text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {submitter?.FullName || submission.SubmittedBy}
                                    </p>
                                    <p className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>
                                      {new Date(submission.SubmittedAt).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    // Download functionality - open attachments or generate PDF
                                    if (submission.AttachmentLinks) {
                                      const links = submission.AttachmentLinks.split(',');
                                      links.forEach(link => {
                                        const url = link.trim();
                                        if (url) {
                                          window.open(url, '_blank');
                                        }
                                      });
                                    }
                                  }}
                                  disabled={isGeneratingPdf}
                                  title="Download report"
                                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'hover:bg-[#1E293B] text-secondary hover:text-blue-400' : 'hover:bg-slate-100 text-slate-500 hover:text-blue-600'} disabled:opacity-50`}
                                >
                                  {isGeneratingPdf ? (
                                    <Loader2 size={14} className="animate-spin shrink-0" />
                                  ) : (
                                    <Download size={14} className="shrink-0" />
                                  )}
                                </button>
                              </div>
                              {submission.Note && (
                                <p className={`text-xs sm:text-sm mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {submission.Note}
                                </p>
                              )}
                              {submission.AttachmentLinks && (
                                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                  {submission.AttachmentLinks.split(',').map((link, idx) => (
                                    <a
                                      key={idx}
                                      href={link.trim()}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`inline-link-pill text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded border flex items-center gap-1 ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
                                    >
                                      <Link size={10} className="shrink-0" />
                                      <span>{getFileNameFromUrl(link.trim())}</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Sub-teams */}
                  {teamSubTeams.length > 0 && (
                    <div className={`mt-3 sm:mt-4 pt-3 sm:pt-4 border-t ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                      <p className={`text-xs font-medium mb-2 sm:mb-3 ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>
                        Sub-teams
                      </p>
                      <div className="space-y-2 sm:space-y-3">
                        {teamSubTeams.map(subTeam => {
                          const subTeamMembers = users.filter(u => u.SubTeamIDs?.includes(subTeam.SubTeamID));
                          const isSubTeamLeader = currentUser && subTeam.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
                          const canPostSubTeam = isSubTeamLeader || userIsTeamLeader || (currentUser && isAdminLevel(currentUser.Role));
                          const subTeamSubmissions = teamSubmissions
                            .filter(s => s.TeamID === team.TeamID && s.SubTeamID === subTeam.SubTeamID)
                            .sort((a, b) => new Date(b.SubmittedAt).getTime() - new Date(a.SubmittedAt).getTime());

                          return (
                            <div key={subTeam.SubTeamID} className={`border rounded-lg p-2 sm:p-3 ${isDarkMode ? 'bg-[#0F141F] border-[#334155]' : 'bg-surface border-slate-200'}`}>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                                    <Users size={10} className={`shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className={`text-xs sm:text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {subTeam.SubTeamName}
                                    </h5>
                                    <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-secondary'}`}>
                                      {subTeamMembers.length} member{subTeamMembers.length !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                </div>
                                {canPostSubTeam && (
                                  <button
                                    onClick={() => {
                                      setSubmissionTeamId(team.TeamID);
                                      setSubmissionSubTeamId(subTeam.SubTeamID);
                                      setSubmissionModalOpen(true);
                                    }}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 sm:py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1 shrink-0"
                                  >
                                    <Plus size={10} className="shrink-0" />
                                    <span>Submit</span>
                                  </button>
                                )}
                              </div>
                              {subTeamSubmissions.length > 0 && (
                                <div className={`mt-2 pt-2 border-t ${isDarkMode ? 'border-token' : 'border-slate-100'}`}>
                                  {subTeamSubmissions.slice(0, 2).map(submission => {
                                    const submitter = users.find(u => u.Email === submission.SubmittedBy);
                                    return (
                                      <div key={submission.SubmissionID} className={`p-2 rounded mb-1 last:mb-0 ${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                                              <User size={10} className={`shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className={`text-[10px] sm:text-xs font-medium truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                                {submitter?.FullName || submission.SubmittedBy}
                                              </p>
                                              <p className={`text-[9px] sm:text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-secondary'}`}>
                                                {new Date(submission.SubmittedAt).toLocaleDateString()}
                                              </p>
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => {
                                              if (submission.AttachmentLinks) {
                                                const links = submission.AttachmentLinks.split(',');
                                                links.forEach(link => {
                                                  const url = link.trim();
                                                  if (url) {
                                                    window.open(url, '_blank');
                                                  }
                                                });
                                              }
                                            }}
                                            disabled={isGeneratingPdf}
                                            title="Download report"
                                            className={`p-1 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'hover:bg-[#1E293B] text-secondary hover:text-blue-400' : 'hover:bg-slate-100 text-slate-500 hover:text-blue-600'} disabled:opacity-50`}
                                          >
                                            {isGeneratingPdf ? (
                                              <Loader2 size={12} className="animate-spin shrink-0" />
                                            ) : (
                                              <Download size={12} className="shrink-0" />
                                            )}
                                          </button>
                                        </div>
                                        {submission.Note && (
                                          <p className={`text-[10px] sm:text-xs mt-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                            {submission.Note}
                                          </p>
                                        )}
                                        {submission.AttachmentLinks && (
                                          <div className="flex flex-wrap gap-1 mt-1.5">
                                            {submission.AttachmentLinks.split(',').map((link, idx) => (
                                              <a
                                                key={idx}
                                                href={link.trim()}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`inline-link-pill text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
                                              >
                                                <Link size={9} className="shrink-0" />
                                                <span>{getFileNameFromUrl(link.trim())}</span>
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {subTeamSubmissions.length > 2 && (
                                    <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-secondary'}`}>
                                      +{subTeamSubmissions.length - 2} more submission{subTeamSubmissions.length - 2 !== 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submission Modal */}
      {submissionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className={`w-full max-w-lg rounded-xl p-4 sm:p-6 shadow-2xl border max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-[#0F141F] border-token' : 'bg-surface border-token'}`}
          >
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className={`font-semibold text-base sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Submit Weekly Report
              </h3>
              <button
                onClick={() => {
                  setSubmissionModalOpen(false);
                  setSubmissionNote('');
                  setSubmissionFiles([]);
                  setSubmissionTeamId(null);
                  setSubmissionSubTeamId(null);
                  setSubmissionError(null);
                }}
                className={`p-1 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'hover:bg-[#1E293B] text-secondary' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <X size={16} className="shrink-0" />
              </button>
            </div>

            <form onSubmit={handleTeamSubmission} className="space-y-4">
              {submissionError && (
                <div className={`p-3 rounded-lg text-xs sm:text-sm ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
                  {submissionError}
                </div>
              )}

              {/* Sub-team selection if applicable */}
              {submissionTeamId && (() => {
                const team = teams.find(t => t.TeamID === submissionTeamId);
                const teamSubTeams = subTeams.filter(st => st.TeamID === submissionTeamId && st.Active);
                const reportRequirement = settings.find(s => s.Key === 'weekly_report_requirements')?.Value;
                let requirements: Record<string, { level: 'team' | 'subteam'; subTeamIds: string[] }> = {};
                try {
                  if (reportRequirement) requirements = JSON.parse(reportRequirement);
                } catch (e) { }

                const teamConfig = requirements[submissionTeamId];

                // Show sub-team selection if:
                // 1. Team is configured for sub-team reports AND
                // 2. User is a sub-team leader OR team leader OR admin
                if (teamConfig?.level === 'subteam' && teamSubTeams.length > 0) {
                  const userIsTeamLeader = team?.TeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
                  const userIsSubTeamLeader = teamSubTeams.some(st =>
                    st.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase())
                  );
                  const userIsAdmin = currentUser && isAdminLevel(currentUser.Role);

                  if (userIsTeamLeader || userIsSubTeamLeader || userIsAdmin) {
                    return (
                      <div>
                        <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Select Sub-Team
                        </label>
                        <select
                          value={submissionSubTeamId || ''}
                          onChange={(e) => setSubmissionSubTeamId(e.target.value || null)}
                          className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                        >
                          <option value="">Select a sub-team...</option>
                          {teamSubTeams.map(st => (
                            <option key={st.SubTeamID} value={st.SubTeamID}>
                              {st.SubTeamName}
                            </option>
                          ))}
                        </select>
                        <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-500' : 'text-secondary'}`}>
                          {userIsSubTeamLeader && !userIsTeamLeader && !userIsAdmin ? 'You can only submit for your own sub-team' : 'Team leaders can submit for any sub-team'}
                        </p>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Note (optional)
                </label>
                <textarea
                  value={submissionNote}
                  onChange={(e) => setSubmissionNote(e.target.value)}
                  placeholder="Add any notes about your weekly report..."
                  rows={3}
                  className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                />
              </div>

              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Attachments (optional)
                </label>
                <div className="border-2 border-dashed rounded-lg p-3 sm:p-4 hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={handleSubmissionFileUpload}
                    accept="*/*"
                    className="hidden"
                    id="submission-file-upload"
                  />
                  <label
                    htmlFor="submission-file-upload"
                    className="flex flex-col items-center justify-center cursor-pointer"
                  >
                    <Upload size={18} className={`shrink-0 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`} />
                    <p className={`text-xs sm:text-sm font-medium mt-2 ${isDarkMode ? 'text-slate-300' : 'text-secondary'}`}>
                      Click to upload files
                    </p>
                    <p className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-500' : 'text-secondary'} text-center mt-1`}>
                      PPT, Doc, PDF, or any file type
                    </p>
                  </label>
                </div>

                {submissionFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {submissionFiles.map((file, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <File size={12} className={`shrink-0 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`} />
                          <span className={`text-xs sm:text-sm truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{file.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSubmissionFile(index)}
                          className="text-red-500 hover:text-red-600 transition-colors shrink-0 p-0.5"
                        >
                          <X size={12} className="shrink-0" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 sm:gap-3 pt-2 sm:pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionModalOpen(false);
                    setSubmissionNote('');
                    setSubmissionFiles([]);
                    setSubmissionTeamId(null);
                    setSubmissionError(null);
                  }}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${isDarkMode ? 'bg-[#1E293B] text-slate-300 hover:bg-[#334155]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (!submissionNote.trim() && submissionFiles.length === 0)}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${isSubmitting || (!submissionNote.trim() && submissionFiles.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'} bg-blue-500 text-white`}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit report'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
