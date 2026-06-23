import { Request, Response } from 'express';
import { login, generateUserId } from '../services/authService';
import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues } from '../services/googleSheetsService';
import { BadRequestError, NotFoundError, InternalServerError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth';

/**
 * Login request body
 */
interface LoginRequestBody {
  email: string;
  password: string;
}

/**
 * Account request body
 */
interface AccountRequestRequestBody {
  fullName: string;
  email: string;
  password: string;
  managerEmail: string;
}

/**
 * Change password request body
 */
interface ChangePasswordRequestBody {
  oldPassword: string;
  newPassword: string;
}

/**
 * POST /api/login
 * Simple login endpoint
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginRequestBody;

  if (!email || !password) {
    throw new BadRequestError("Email and password are required");
  }

  const result = await login(email, password);
  res.json(result);
}

/**
 * POST /api/account-request
 * Public endpoint for account requests
 */
export async function accountRequestHandler(req: Request, res: Response): Promise<void> {
  const { fullName, email, password, managerEmail } = req.body as AccountRequestRequestBody;

  if (!fullName || !email || !password || !managerEmail) {
    throw new BadRequestError("All required fields must be provided");
  }

  if (password.length < 6) {
    throw new BadRequestError("Password must be at least 6 characters");
  }

  // Get Google Sheets access token
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google Sheets");
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    throw new InternalServerError("Spreadsheet ID not found");
  }

  // Fetch existing users to check for duplicate email and determine manager role
  const usersRange = 'users!A:R';
  const existingUsers = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!existingUsers) {
    throw new InternalServerError("Failed to check existing users");
  }

  const normalizedEmail = email.toLowerCase();
  const normalizedManagerEmail = managerEmail.toLowerCase();

  // Check if email already exists
  for (const row of existingUsers) {
    if (row[3] === normalizedEmail) { // Email is in column 4 (index 3)
      throw new BadRequestError("An account with this email already exists");
    }
  }

  // Determine role based on manager email
  // If manager is Admin, role is Stakeholder, otherwise Sub-stakeholder
  let role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder' = 'Sub-stakeholder';
  for (const row of existingUsers) {
    if (row[3] === normalizedManagerEmail && row[4] === 'Admin') { // Email (index 3) and Role (index 4)
      role = 'Stakeholder';
      break;
    }
  }

  // Create new user with pending approval status
  const newUserId = generateUserId();
  const now = new Date().toISOString();
  const teamId = 'T-01';
  const teamName = 'Enterprise Sales';

  const newUserRow = [
    newUserId,                    // UserID (A)
    fullName,                     // FullName (B)
    normalizedEmail,              // Email (C)
    role,                         // Role (D)
    normalizedManagerEmail,       // ManagerEmail (E)
    teamId,                       // TeamID (F)
    teamName,                     // TeamName (G)
    'false',                      // Active (H) - inactive until approved
    'true',                       // CanCreateFollowUp (I)
    'true',                       // CanCloseTask (J)
    now,                          // CreatedAt (K)
    now,                          // UpdatedAt (L)
    password,                     // Password (M)
    'pending',                    // ApprovalStatus (N)
    normalizedEmail,              // RequestedBy (O)
    now,                          // RequestedAt (P)
    '',                           // ApprovedBy (Q)
    ''                            // ApprovedAt (R)
  ];

  // Append new user to Google Sheets
  const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'users', [newUserRow]);

  if (!success) {
    throw new InternalServerError("Failed to submit account request");
  }

  res.json({
    success: true,
    message: "Account request submitted successfully. Please wait for admin approval."
  });
}

/**
 * POST /api/approve-user
 * Protected endpoint to approve user accounts
 */
export async function approveUserHandler(req: AuthRequest, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    throw new BadRequestError("Email is required");
  }

  // Get Google Sheets access token
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google Sheets");
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    throw new InternalServerError("Spreadsheet ID not found");
  }

  // Fetch all users
  const usersRange = 'users!A:R';
  const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!users) {
    throw new InternalServerError("Failed to fetch users");
  }

  const normalizedEmail = email.toLowerCase();
  const adminEmail = req.user?.email || 'admin';

  // Find the user to approve
  let userRowIndex = -1;
  let userRow: any[] | null = null;

  for (let i = 0; i < users.length; i++) {
    const row = users[i];
    if (row[3] === normalizedEmail) { // Email is in column 4 (index 3)
      userRowIndex = i;
      userRow = row;
      break;
    }
  }

  if (!userRow) {
    throw new NotFoundError("User not found");
  }

  // Update user row: set Active to true, ApprovalStatus to approved, add approver info
  const now = new Date().toISOString();
  userRow[7] = 'true'; // Active (H)
  userRow[13] = 'approved'; // ApprovalStatus (N)
  userRow[16] = adminEmail; // ApprovedBy (Q)
  userRow[17] = now; // ApprovedAt (R)

  // Update the user row in Google Sheets
  const success = await updateSheetValues(
    tokenData.accessToken,
    spreadsheetId,
    `users!A${userRowIndex + 1}:R${userRowIndex + 1}`,
    [userRow]
  );

  if (!success) {
    throw new InternalServerError("Failed to approve user");
  }

  res.json({
    success: true,
    message: "User approved successfully"
  });
}

/**
 * POST /api/change-password
 * Protected endpoint to change user password
 */
export async function changePasswordHandler(req: AuthRequest, res: Response): Promise<void> {
  const { oldPassword, newPassword } = req.body as ChangePasswordRequestBody;

  if (!oldPassword || !newPassword) {
    throw new BadRequestError("Old password and new password are required");
  }

  if (newPassword.length < 6) {
    throw new BadRequestError("New password must be at least 6 characters");
  }

  // Get Google Sheets access token
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google Sheets");
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    throw new InternalServerError("Spreadsheet ID not found");
  }

  // Fetch all users
  const usersRange = 'users!A:R';
  const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!users) {
    throw new InternalServerError("Failed to fetch users");
  }

  const userEmail = req.user?.email;
  if (!userEmail) {
    throw new BadRequestError("User email not found in token");
  }

  const normalizedEmail = userEmail.toLowerCase();

  // Find the user
  let userRowIndex = -1;
  let userRow: any[] | null = null;

  for (let i = 0; i < users.length; i++) {
    const row = users[i];
    if (row[3] === normalizedEmail) { // Email is in column 4 (index 3)
      userRowIndex = i;
      userRow = row;
      break;
    }
  }

  if (!userRow) {
    throw new NotFoundError("User not found");
  }

  // Verify old password
  const storedPassword = userRow[12]; // Password is in column 13 (index 12)
  if (storedPassword !== oldPassword) {
    throw new BadRequestError("Old password is incorrect");
  }

  // Update password
  const now = new Date().toISOString();
  userRow[12] = newPassword; // Password (M)
  userRow[11] = now; // UpdatedAt (L)

  // Update the user row in Google Sheets
  const success = await updateSheetValues(
    tokenData.accessToken,
    spreadsheetId,
    `users!A${userRowIndex + 1}:R${userRowIndex + 1}`,
    [userRow]
  );

  if (!success) {
    throw new InternalServerError("Failed to update password");
  }

  res.json({
    success: true,
    message: "Password changed successfully"
  });
}
