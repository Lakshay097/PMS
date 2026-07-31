import React from 'react';
import { Task, User as UserType, TaskReport, Team, SubTeam, AppSetting } from '../types';
import Reports from '../components/features/reports/Reports';

interface ReportsPageProps {
  tasks: Task[];
  currentUser: UserType;
  users?: UserType[];
  teams?: Team[];
  subTeams?: SubTeam[];
  reports?: TaskReport[];
  settings?: AppSetting[];
  onTaskClick?: (task: Task) => void;
  isDarkMode?: boolean;
}

export default function ReportsPage({
  tasks,
  currentUser,
  users = [],
  teams = [],
  subTeams = [],
  reports = [],
  settings = [],
  onTaskClick,
  isDarkMode = false,
}: ReportsPageProps) {
  return (
    <Reports
      tasks={tasks}
      currentUser={currentUser}
      users={users}
      teams={teams}
      subTeams={subTeams}
      reports={reports}
      settings={settings}
      isDarkMode={isDarkMode}
    />
  );
}
