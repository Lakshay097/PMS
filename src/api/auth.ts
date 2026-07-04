import { api } from './client';
import { User } from '../types/index';
import { ROLE } from '../constants/status';

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

/**
 * Account request body
 */
export interface AccountRequest {
  fullName: string;
  email: string;
  password: string;
  managerEmail: string;
  teamId?: string; // optional — leave blank and Admin will assign after approval
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

/**
 * Change password request body
 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/**
 * Change password response
 */
export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

/**
 * Change user password (requires auth)
 */
export async function changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return api.post<ChangePasswordResponse>('/change-password', data);
}

// ─── SuperAdmin API calls ──────────────────────────────────────────────────

/**
 * Reveal password request
 */
export interface RevealPasswordRequest {
  email: string;
}

/**
 * Reveal password response
 */
export interface RevealPasswordResponse {
  success: boolean;
  email: string;
  fullName: string;
  storedPasswordSheets: string | null;
  storedPasswordFirestore: string | null;
  isBcryptHash: boolean;
  note: string;
}

/**
 * Update user request (SuperAdmin only)
 */
export interface SuperAdminUpdateUserRequest {
  email: string;
  fullName?: string;
  role?: string;
  active?: boolean;
  password?: string;
  managerEmail?: string;
  teamId?: string;
  teamName?: string;
  canCreateFollowUp?: boolean;
  canCloseTask?: boolean;
  approvalStatus?: string;
  firestorePatch?: Record<string, any>;
}

/**
 * Update user response (SuperAdmin only)
 */
export interface SuperAdminUpdateUserResponse {
  success: boolean;
  message: string;
  updatedFields: string[];
}

/**
 * List all users response (SuperAdmin only)
 */
export interface SuperAdminListUsersResponse {
  success: boolean;
  users: Array<{
    UserID: string;
    FullName: string;
    Email: string;
    Role: string;
    ManagerEmail: string;
    TeamID: string;
    TeamName: string;
    Active: string;
    CanCreateFollowUp: string;
    CanCloseTask: string;
    CreatedAt: string;
    UpdatedAt: string;
    StoredPassword: string;
    ApprovalStatus: string;
    RequestedBy: string;
    RequestedAt: string;
    ApprovedBy: string;
    ApprovedAt: string;
    isBcryptHash: boolean;
  }>;
}

/**
 * Reveal stored password for a user (SuperAdmin only)
 * Returns the raw stored value (bcrypt hash or plaintext)
 */
export async function revealPassword(data: RevealPasswordRequest): Promise<RevealPasswordResponse> {
  return api.post<RevealPasswordResponse>('/superadmin/reveal-password', data);
}

/**
 * Directly update any user field in Sheets and Firestore (SuperAdmin only)
 */
export async function superAdminUpdateUser(data: SuperAdminUpdateUserRequest): Promise<SuperAdminUpdateUserResponse> {
  return api.post<SuperAdminUpdateUserResponse>('/superadmin/update-user', data);
}

/**
 * List all users including stored passwords (SuperAdmin only)
 */
export async function superAdminListUsers(): Promise<SuperAdminListUsersResponse> {
  return api.get<SuperAdminListUsersResponse>('/superadmin/all-users');
}
