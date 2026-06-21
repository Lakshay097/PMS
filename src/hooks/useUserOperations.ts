import { useCallback } from 'react';
import { User, Team } from '../types';
import { dbService } from '../lib/dbService';
import { ROLE } from '../constants/status';
import { approveUser } from '../api/auth';

interface UseUserOperationsProps {
  users: User[];
  teams: Team[];
  syncDatabase: () => Promise<void>;
  logAudit: (entity: string, id: string, action: string, oldValue: string, newValue: string) => Promise<void>;
}

export function useUserOperations({
  users,
  teams,
  syncDatabase,
  logAudit,
}: UseUserOperationsProps) {
  const handleUpdateUserTeams = useCallback(async (email: string, teamIDs: string[], teamNames: string[]) => {
    const foundUser = users.find(u => u.Email === email);
    if (foundUser) {
      const updatedUser = { 
        ...foundUser, 
        TeamIDs: teamIDs, 
        TeamNames: teamNames, 
        UpdatedAt: new Date().toISOString() 
      };
      await dbService.saveUser(updatedUser);
      await logAudit('User', foundUser.UserID, `Updated Team memberships to: ${teamNames.join(', ')}`, JSON.stringify(foundUser.TeamIDs), JSON.stringify(teamIDs));
      await syncDatabase();
    }
  }, [users, logAudit, syncDatabase]);

  const handleAddUser = useCallback(async (newUser: User) => {
    await dbService.saveUser(newUser);
    await logAudit('User', newUser.UserID, 'Account Authorized', '', JSON.stringify(newUser));
  }, [logAudit]);

  const handleToggleUserStatus = useCallback(async (email: string) => {
    const foundUser = users.find(u => u.Email === email);
    if (foundUser) {
      const updatedUser = { ...foundUser, Active: !foundUser.Active, UpdatedAt: new Date().toISOString() };
      await dbService.saveUser(updatedUser);
      await logAudit('User', foundUser.UserID, `Toggle Active State : ${updatedUser.Active}`, JSON.stringify({ Active: foundUser.Active }), JSON.stringify({ Active: updatedUser.Active }));
    }
  }, [users, logAudit]);

  const handleApproveUser = useCallback(async (email: string) => {
    try {
      await approveUser({ email });
    } catch (error) {
      console.error('Error approving user:', error);
    }
  }, []);

  const handleUpdateUserRole = useCallback(async (email: string, newRole: typeof ROLE[keyof typeof ROLE]) => {
    const foundUser = users.find(u => u.Email === email);
    if (foundUser) {
      const updatedUser = { ...foundUser, Role: newRole, UpdatedAt: new Date().toISOString() };
      await dbService.saveUser(updatedUser);
      await dbService.logAction('User', foundUser.UserID, `Role updated to ${newRole}`, foundUser.Email, null, updatedUser);
    }
  }, [users, logAudit]);

  return {
    handleUpdateUserTeams,
    handleAddUser,
    handleToggleUserStatus,
    handleApproveUser,
    handleUpdateUserRole,
  };
}
