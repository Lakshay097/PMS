import { User } from '../types';

/**
 * Returns flat list of all subordinate emails recursively (downward only)
 * with cycle protection to prevent infinite loops from circular ManagerEmail references.
 * @param currentUserEmail - The email of the current user
 * @param allUsers - Array of all users in the system
 * @param visited - Internal set tracking visited emails to prevent cycles
 * @returns Array of subordinate emails (direct and indirect)
 */
export function getAllSubordinates(
  currentUserEmail: string, 
  allUsers: User[],
  visited: Set<string> = new Set()
): string[] {
  const normalizedEmail = currentUserEmail.toLowerCase();
  
  // Cycle detection: if we've already processed this user, stop
  if (visited.has(normalizedEmail)) {
    return [];
  }
  
  visited.add(normalizedEmail);
  
  const directSubs = allUsers.filter(u => 
    u.ManagerEmail?.toLowerCase() === normalizedEmail
  );
  const result: string[] = directSubs.map(u => u.Email);
  for (const sub of directSubs) {
    result.push(...getAllSubordinates(sub.Email, allUsers, visited));
  }
  return result;
}
