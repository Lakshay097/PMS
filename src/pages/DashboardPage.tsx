import React from 'react';
import { Task, User as UserType, TaskTemplate, AuditLog, AppSetting, Team, SubTeam, EmailTemplate, TaskReport, TeamSubmission } from '../types';
import Dashboard from '../components/features/dashboard/Dashboard';

interface DashboardPageProps {
  tasks: Task[];
  currentUser: UserType;
  // teamIds param was previously absent, causing it to be silently dropped at
  // this boundary when App.tsx passed it (e.g. "Assign Task to Team" button).
  onNewTask: (assigneeEmail?: string, teamIds?: string[]) => void;
  onTaskClick: (task: Task) => void;
  onLogout: () => void;
  templates?: TaskTemplate[];
  onViewChange?: (view: 'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings' | 'scheduled-tasks') => void;
  users?: UserType[];
  onAddUser?: (userData: UserType) => void;
  onAddTemplate?: (templateData: TaskTemplate) => void;
  onToggleTemplateStatus?: (templateId: string) => void;
  onUpdateSetting?: (key: string, value: string) => void;
  onEditProfile?: () => void;
  onChangePassword?: () => void;
  onConfigureNotifications?: () => void;
  onToggleUserActive?: (userId: string, active: boolean) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onSyncDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  dbConnectionStatus?: 'connected' | 'disconnected' | 'error';
  audits?: AuditLog[];
  settings?: AppSetting[];
  emailTemplates?: EmailTemplate[];
  teams?: Team[];
  subTeams?: SubTeam[];
  // Props below were omitted from this interface since the file was created,
  // causing App.tsx to silently drop them at the {...props} spread boundary.
  reports?: TaskReport[];
  teamSubmissions?: TeamSubmission[];
  onAddTeamSubmission?: (submission: TeamSubmission) => void;
  triggerNotification?: (type: string, message: string, emailSentTo: string) => void;
  onToggleUserStatus?: (email: string) => void;
  onUpdateUserRole?: (email: string, role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => void;
  onApproveUser?: (email: string) => void;
  onAddTeam?: (team: Team) => void;
  onToggleTeamStatus?: (teamId: string) => void;
  onUpdateUserTeams?: (email: string, teamIDs: string[], teamNames: string[]) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
  onSaveSubTeam?: (subTeam: SubTeam) => Promise<void>;
  onDeleteSubTeam?: (subTeamId: string) => Promise<void>;
  onUpdateSubTeamLeaders?: (teamId: string, subTeamId: string, leaderEmails: string[]) => Promise<void>;
  onAssignUserToSubTeam?: (userEmail: string, subTeamId: string | null, subTeamName: string | null) => Promise<void>;
  onRemoveUserFromSubTeam?: (userEmail: string, subTeamId: string) => Promise<void>;
  onDeleteTask?: (taskId: string) => void;
  isDrawerOpen?: boolean;
  isTaskModalOpen?: boolean;
  isReportModalOpen?: boolean;
  isFollowUpModalOpen?: boolean;
  isEditProfileModalOpen?: boolean;
  isChangePasswordModalOpen?: boolean;
  isConfigureNotificationsModalOpen?: boolean;
  isAddUserModalOpen?: boolean;
  isAddTeamModalOpen?: boolean;
  syncStatus?: 'synced' | 'syncing' | 'error';
}

export default function DashboardPage(props: DashboardPageProps) {
  return <Dashboard {...props} />;
}
