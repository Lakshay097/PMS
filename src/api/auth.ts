import { api } from './client';
import { User } from '../types/index';
import { ROLE } from '../constants/status';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  email: string;
  UserID: string;
  Role: string;
  FullName: string;
  TeamID: string;
  TeamName: string;
  Active: boolean;
}

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
    Role: response.Role as typeof ROLE[keyof typeof ROLE],
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

export interface AccountRequest {
  fullName: string;
  email: string;
  password: string;
  managerEmail: string;
  teamId?: string;
}

export interface AccountRequestResponse {
  success: boolean;
  message: string;
}

export interface ApproveUserRequest {
  email: string;
}

export interface ApproveUserResponse {
  success: boolean;
  message: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>('/login', credentials, { skipAuth: true });
}

export async function requestAccount(data: AccountRequest): Promise<AccountRequestResponse> {
  return api.post<AccountRequestResponse>('/account-request', data, { skipAuth: true });
}

export async function approveUser(data: ApproveUserRequest): Promise<ApproveUserResponse> {
  return api.post<ApproveUserResponse>('/approve-user', data);
}

export async function changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return api.post<ChangePasswordResponse>('/change-password', data);
}
