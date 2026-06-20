import { api } from './client';

/**
 * User interface
 */
export interface User {
  UserID: string;
  FullName: string;
  Email: string;
  Role: string;
  TeamID: string;
  TeamName: string;
  Active: boolean;
  ManagerEmail: string;
  CreatedAt: string;
  UpdatedAt: string;
}

/**
 * Get all users
 */
export async function getUsers(): Promise<User[]> {
  return api.get<User[]>('/users');
}

/**
 * Get a single user by ID
 */
export async function getUser(id: string): Promise<User> {
  return api.get<User>(`/users/${id}`);
}

/**
 * Update a user
 */
export async function updateUser(id: string, data: Partial<User>): Promise<User> {
  return api.put<User>(`/users/${id}`, data);
}

/**
 * Delete a user
 */
export async function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}`);
}
