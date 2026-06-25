import { User } from '../types';

/**
 * Returns flat list of all subordinate emails recursively (downward only)
 * @param currentUserEmail - The email of the current user
 * @param allUsers - Array of all users in the system
 * @returns Array of subordinate emails (direct and indirect)
 */
export function getAllSubordinates(currentUserEmail: string, allUsers: User[]): string[] {
  const directSubs = allUsers.filter(u => 
    u.ManagerEmail?.toLowerCase() === currentUserEmail.toLowerCase()
  );
  const result: string[] = directSubs.map(u => u.Email);
  for (const sub of directSubs) {
    result.push(...getAllSubordinates(sub.Email, allUsers));
  }
  return result;
}
