import { api } from './client';

/**
 * Team interface
 */
export interface Team {
  TeamID: string;
  TeamName: string;
  Description: string;
  CreatedAt: string;
  UpdatedAt: string;
}

/**
 * Get all teams
 */
export async function getTeams(): Promise<Team[]> {
  return api.get<Team[]>('/teams');
}

/**
 * Get a single team by ID
 */
export async function getTeam(id: string): Promise<Team> {
  return api.get<Team>(`/teams/${id}`);
}

/**
 * Create a new team
 */
export async function createTeam(data: Omit<Team, 'TeamID' | 'CreatedAt' | 'UpdatedAt'>): Promise<Team> {
  return api.post<Team>('/teams', data);
}

/**
 * Update a team
 */
export async function updateTeam(id: string, data: Partial<Team>): Promise<Team> {
  return api.put<Team>(`/teams/${id}`, data);
}

/**
 * Delete a team
 */
export async function deleteTeam(id: string): Promise<void> {
  return api.delete<void>(`/teams/${id}`);
}
