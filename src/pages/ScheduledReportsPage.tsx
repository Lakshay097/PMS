import React from 'react';
import { Task, User as UserType, Team, SubTeam, TeamSubmission, AppSetting } from '../types';
import ScheduledReports from '../components/features/schedules/ScheduledReports';

interface ScheduledReportsPageProps {
  tasks: Task[];
  currentUser: UserType;
  users?: UserType[];
  teams?: Team[];
  subTeams?: SubTeam[];
  teamSubmissions?: TeamSubmission[];
  settings?: AppSetting[];
  onAddTeamSubmission?: (submission: TeamSubmission) => void;
  isDarkMode?: boolean;
}

export default function ScheduledReportsPage({
  tasks,
  currentUser,
  users = [],
  teams = [],
  subTeams = [],
  teamSubmissions = [],
  settings = [],
  onAddTeamSubmission,
  isDarkMode = false,
}: ScheduledReportsPageProps) {
  return (
    <ScheduledReports
      tasks={tasks}
      currentUser={currentUser}
      users={users}
      teams={teams}
      subTeams={subTeams}
      teamSubmissions={teamSubmissions}
      settings={settings}
      onAddTeamSubmission={onAddTeamSubmission}
    />
  );
}
