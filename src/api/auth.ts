import { api } from './client';
import { User } from '../types';

/**
 * Login request body
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * User response from backend (simplified version)
 */
export interface UserResponse {
  email: string;
  UserID: string;
  Role: string;
  FullName: string;
  TeamID: string;
  TeamName: string;
  Active: boolean;
}

/**
 * Login response
 */
export interface LoginResponse {
  token: string;
  user: UserResponse;
  expiresIn: string;
}

/**
 * Convert backend UserResponse to frontend User type
 */
export function mapUserResponseToUser(response: UserResponse): User {
  return {
    UserID: response.UserID,
    FullName: response.FullName,
    Email: response.email,
    Role: response.Role as 'Admin' | 'Stakeholder' | 'Sub-stakeholder',
    ManagerEmail: '',
    TeamIDs: [response.TeamID],
    TeamNames: [response.TeamName],
    Active: response.Active,
    CanCreateFollowUp: true,
    CanCloseTask: true,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString(),
    TeamID: response.TeamID,
    TeamName: response.TeamName,
  };
}

/**
 * Account request body
 */
export interface AccountRequest {
  fullName: string;
  email: string;
  password: string;
  managerEmail: string;
}

/**
 * Account request response
 */
export interface AccountRequestResponse {
  success: boolean;
  message: string;
}

/**
 * Approve user request body
 */
export interface ApproveUserRequest {
  email: string;
}

/**
 * Approve user response
 */
export interface ApproveUserResponse {
  success: boolean;
  message: string;
}

/**
 * Login with email and password
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>('/login', credentials, { skipAuth: true });
}

/**
 * Request a new account
 */
export async function requestAccount(data: AccountRequest): Promise<AccountRequestResponse> {
  return api.post<AccountRequestResponse>('/account-request', data, { skipAuth: true });
}

/**
 * Approve a user account (requires auth)
 */
export async function approveUser(data: ApproveUserRequest): Promise<ApproveUserResponse> {
  return api.post<ApproveUserResponse>('/approve-user', data);
}
