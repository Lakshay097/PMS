import { useCallback } from 'react';
import { Team, User } from '../types';
import { dbService } from '../lib/dbService';

interface UseTeamOperationsProps {
  teams: Team[];
  users: User[];
  syncDatabase: () => Promise<void>;
  silentSync: () => Promise<void>;
  logAudit: (entity: string, id: string, action: string, oldValue: string, newValue: string) => Promise<void>;
}

export function useTeamOperations({
  teams,
  users,
  syncDatabase,
  silentSync,
  logAudit,
}: UseTeamOperationsProps) {
  const handleDeleteTeam = useCallback(async (teamId: string) => {
    const targetTeam = teams.find(t => t.TeamID === teamId);
    if (!targetTeam) return;

    // 1. Delete from teams collection
    await dbService.deleteTeam(teamId);

    // 2. Remove team reference from all users who belonged to it
    const usersToUpdate = users.filter(u => u.TeamIDs.includes(teamId));
    for (const u of usersToUpdate) {
      const updatedTeamIDs = u.TeamIDs.filter(id => id !== teamId);
      const updatedTeamNames = u.TeamNames.filter(name => name !== targetTeam.TeamName);
      await dbService.saveUser({
        ...u,
        TeamIDs: updatedTeamIDs,
        TeamNames: updatedTeamNames,
        UpdatedAt: new Date().toISOString()
      });
    }

    await logAudit('Team', teamId, `Deleted Team: ${targetTeam.TeamName}`, JSON.stringify(targetTeam), '');
    // Optimistic update handles UI refresh automatically
  }, [teams, users, logAudit]);

  const handleRenameTeam = useCallback(async (teamId: string, newName: string) => {
    const targetTeam = teams.find(t => t.TeamID === teamId);
    if (!targetTeam) return;

    const oldName = targetTeam.TeamName;

    // 1. Update team name in teams collection
    await dbService.saveTeam({
      ...targetTeam,
      TeamName: newName,
      UpdatedAt: new Date().toISOString()
    });

    // 2. Update team name in all users who belong to this team
    const usersToUpdate = users.filter(u => u.TeamIDs.includes(teamId));
    for (const u of usersToUpdate) {
      const updatedTeamNames = u.TeamNames.map(name => name === oldName ? newName : name);
      await dbService.saveUser({
        ...u,
        TeamNames: updatedTeamNames,
        UpdatedAt: new Date().toISOString()
      });
    }

    await logAudit('Team', teamId, `Renamed Team: ${oldName} → ${newName}`, oldName, newName);
    // Optimistic update handles UI refresh automatically
  }, [teams, users, logAudit]);

  return {
    handleDeleteTeam,
    handleRenameTeam,
  };
}
