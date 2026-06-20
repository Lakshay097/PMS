import React from 'react';
import { User as UserType, TaskTemplate, AuditLog, AppSetting, Team } from '../types';
import AdminPanel from '../components/AdminPanel';

interface AdminPageProps {
  users: UserType[];
  templates: TaskTemplate[];
  audits: AuditLog[];
  settings: AppSetting[];
  teams: Team[];
  onAddUser: (user: UserType) => void;
  onToggleUserStatus: (email: string) => void;
  onAddTemplate: (template: TaskTemplate) => void;
  onToggleTemplateStatus: (templateId: string) => void;
  onUpdateSetting: (key: string, value: string) => void;
  onUpdateUserRole: (email: string, role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => void;
  onApproveUser: (email: string) => void;
  onAddTeam: (team: Team) => void;
  onToggleTeamStatus: (teamId: string) => void;
  onUpdateUserTeams: (email: string, teamIDs: string[], teamNames: string[]) => void;
  onDeleteTeam: (teamId: string) => void;
  onSyncDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  dbConnectionStatus?: 'connected' | 'disconnected' | 'error';
}

export default function AdminPage(props: AdminPageProps) {
  return <AdminPanel {...props} />;
}
