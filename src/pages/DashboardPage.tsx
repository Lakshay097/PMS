import React from 'react';
import { Task, User as UserType, TaskTemplate, AuditLog, AppSetting, Team } from '../types';
import Dashboard from '../components/features/dashboard/Dashboard';

interface DashboardPageProps {
  tasks: Task[];
  currentUser: UserType;
  onNewTask: (assigneeEmail?: string) => void;
  onTaskClick: (task: Task) => void;
  onLogout: () => void;
  templates?: TaskTemplate[];
  onViewChange?: (view: 'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings') => void;
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
  teams?: Team[];
  onToggleUserStatus?: (email: string) => void;
  onUpdateUserRole?: (email: string, role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => void;
  onApproveUser?: (email: string) => void;
  onAddTeam?: (team: Team) => void;
  onToggleTeamStatus?: (teamId: string) => void;
  onUpdateUserTeams?: (email: string, teamIDs: string[], teamNames: string[]) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
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
}

export default function DashboardPage(props: DashboardPageProps) {
  return <Dashboard {...props} />;
}
