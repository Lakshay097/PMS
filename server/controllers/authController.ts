import { Request, Response } from 'express';
import { login, generateUserId } from '../services/authService';
import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues } from '../services/googleSheetsService';
import { BadRequestError, NotFoundError, InternalServerError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcrypt';
import { firestoreAdmin } from '../services/firebaseAdmin';

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
  teamId?: string;
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
  const { fullName, email, password, managerEmail, teamId } = req.body as AccountRequestRequestBody;

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
    const existingEmail = row[2] ? String(row[2]).toLowerCase().trim() : '';
    if (existingEmail === normalizedEmail) { // Email is in column 3 (index 2)
      throw new BadRequestError("An account with this email already exists");
    }
  }

  // Determine role based on manager email
  // If manager is Admin, role is Stakeholder, otherwise Sub-stakeholder
  let role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder' = 'Sub-stakeholder';
  for (const row of existingUsers) {
    if (row[2] === normalizedManagerEmail && row[3] === 'Admin') { // Email (index 2) and Role (index 3)
      role = 'Stakeholder';
      break;
    }
  }

  // Create new user with pending approval status
  const newUserId = generateUserId();
  const now = new Date().toISOString();

  // Resolve team name from Firestore if a teamId was provided.
  // An unrecognised teamId is treated as "no team" rather than an error —
  // the Admin can correct assignment after approval.
  let resolvedTeamId = '';
  let resolvedTeamName = '';
  if (teamId) {
    try {
      const teamDoc = await firestoreAdmin.collection('teams').doc(teamId).get();
      if (teamDoc.exists && teamDoc.data()?.Active) {
        resolvedTeamId   = teamDoc.data()!.TeamID   as string;
        resolvedTeamName = teamDoc.data()!.TeamName as string;
      }
    } catch (err) {
      console.warn('Could not resolve teamId during account request:', teamId, err);
      // non-fatal — proceed with empty team
    }
  }

  // Always store a bcrypt hash — never plaintext. This is also what the
  // Firestore→Sheets sync will write back, so the column stays populated.
  const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

  const newUserRow = [
    newUserId,                    // UserID (A)
    fullName,                     // FullName (B)
    normalizedEmail,              // Email (C)
    role,                         // Role (D)
    normalizedManagerEmail,       // ManagerEmail (E)
    resolvedTeamId,               // TeamID (F)
    resolvedTeamName,             // TeamName (G)
    'false',                      // Active (H) - inactive until approved
    'true',                       // CanCreateFollowUp (I)
    'true',                       // CanCloseTask (J)
    now,                          // CreatedAt (K)
    now,                          // UpdatedAt (L)
    hashedPassword,               // Password (M) — bcrypt hash
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

  // Write to Firestore so the Admin Panel (which reads Firestore) can see this pending request.
  // This is mandatory - Admin Panel reads from Firestore for visibility, not Sheets.
  // Password is stored here too so that the background Firestore→Sheets sync never overwrites
  // column M with an empty string.
  await firestoreAdmin.collection('users').doc(normalizedEmail).set({
    UserID: newUserId,
    FullName: fullName,
    Email: normalizedEmail,
    Role: role,
    ManagerEmail: normalizedManagerEmail,
    TeamID: resolvedTeamId,
    TeamName: resolvedTeamName,
    TeamIDs: resolvedTeamId ? [resolvedTeamId] : [],
    TeamNames: resolvedTeamName ? [resolvedTeamName] : [],
    Active: false,
    CanCreateFollowUp: true,
    CanCloseTask: true,
    CreatedAt: now,
    UpdatedAt: now,
    Password: hashedPassword,   // keep in sync so Sheets sync round-trips correctly
    ApprovalStatus: 'pending',
    RequestedBy: normalizedEmail,
    RequestedAt: now,
  });

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
    if (row[2] === normalizedEmail) { // Email is in column 3 (index 2)
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

  // Mirror approval into Firestore so the Admin Panel reflects the change.
  // We read the password from the Sheets row so the Firestore document stays
  // in sync — the background Sheets sync reads from Firestore, so if Password
  // is absent from the Firestore doc it would overwrite column M with empty.
  try {
    const existingPassword: string = userRow[12] || '';
    await firestoreAdmin.collection('users').doc(normalizedEmail).set({
      Active: true,
      ApprovalStatus: 'approved',
      ApprovedBy: adminEmail,
      ApprovedAt: now,
      UpdatedAt: now,
      ...(existingPassword ? { Password: existingPassword } : {}),
    }, { merge: true });
  } catch (firestoreErr) {
    console.error("Failed to mirror user approval into Firestore:", firestoreErr);
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

  console.log('Password change attempt for user:', req.user?.email);

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

  console.log('Total users fetched:', users.length);

  const userEmail = req.user?.email;
  if (!userEmail) {
    throw new BadRequestError("User email not found in token");
  }

  const normalizedEmail = userEmail.toLowerCase();
  console.log('Looking for user with email:', normalizedEmail);

  // Find the user - skip header row (index 0), email is at index 2
  let userRowIndex = -1;
  let userRow: any[] | null = null;

  for (let i = 1; i < users.length; i++) {
    const row = users[i];
    console.log(`Row ${i} email:`, row[2]);
    if (row[2] === normalizedEmail) { // Email is in column 3 (index 2)
      userRowIndex = i;
      userRow = row;
      break;
    }
  }

  if (!userRow) {
    console.log('User not found');
    throw new NotFoundError("User not found");
  }

  console.log('User found at row:', userRowIndex);

  // Verify old password
  const storedPassword: string | undefined = userRow[12]; // Password is in column 13 (index 12)
  if (!storedPassword) {
    throw new BadRequestError("No password is set for this account. Please contact your administrator.");
  }
  const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
  
  let passwordMatches = false;
  if (isBcryptHash) {
    passwordMatches = await bcrypt.compare(oldPassword, storedPassword);
  } else {
    // Legacy plaintext fallback
    passwordMatches = oldPassword === storedPassword;
  }

  if (!passwordMatches) {
    throw new BadRequestError("Old password is incorrect");
  }

  // Update password - hash it with bcrypt
  const now = new Date().toISOString();
  const hashedPassword = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
  userRow[12] = hashedPassword; // Password (M)
  userRow[11] = now; // UpdatedAt (L)

  // CRITICAL: Update Firestore FIRST, then Sheets
  // The background Firestore→Sheets sync runs every 5 minutes and will overwrite
  // Sheets with Firestore data. If we don't update Firestore first, the new password
  // in Sheets will be immediately overwritten by the old/empty value from Firestore.
  try {
    await firestoreAdmin.collection('users').doc(normalizedEmail).set({
      Password: hashedPassword,
      UpdatedAt: now,
    }, { merge: true });
  } catch (firestoreErr) {
    console.error("Failed to update password in Firestore:", firestoreErr);
    throw new InternalServerError("Failed to update password in Firestore");
  }

  // Update the user row in Google Sheets
  const success = await updateSheetValues(
    tokenData.accessToken,
    spreadsheetId,
    `users!A${userRowIndex + 1}:R${userRowIndex + 1}`,
    [userRow]
  );

  if (!success) {
    throw new InternalServerError("Failed to update password in Sheets");
  }

  res.json({
    success: true,
    message: "Password changed successfully"
  });
}

/**
 * Bulk user upload request body
 */
interface BulkUserUploadRequestBody {
  users: Array<{
    FullName: string;
    Email: string;
    Role: string;
    ManagerEmail: string;
    TeamName: string;
    Password: string;
  }>;
}

/**
 * POST /api/bulk-upload-users
 * Protected endpoint to bulk upload users via CSV
 */
export async function bulkUploadUsersHandler(req: AuthRequest, res: Response): Promise<void> {
  const { users: usersToUpload } = req.body as BulkUserUploadRequestBody;

  if (!usersToUpload || !Array.isArray(usersToUpload)) {
    throw new BadRequestError("Users array is required");
  }

  if (usersToUpload.length === 0) {
    throw new BadRequestError("At least one user must be provided");
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

  // Fetch existing users to check for duplicates
  const usersRange = 'users!A:R';
  const existingUsers = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!existingUsers) {
    throw new InternalServerError("Failed to fetch existing users");
  }

  const existingEmails = new Set(
    existingUsers.slice(1).map(row => row[2]?.toLowerCase()).filter(Boolean)
  );

  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ email: string; error: string }>
  };

  const now = new Date().toISOString();
  const rowsToAppend: any[][] = [];

  for (const user of usersToUpload) {
    const normalizedEmail = user.Email.toLowerCase();
    const normalizedManagerEmail = user.ManagerEmail?.toLowerCase() || '';

    // Validate required fields
    if (!user.FullName || !user.Email || !user.Role || !user.Password) {
      results.failed++;
      results.errors.push({
        email: user.Email || 'unknown',
        error: 'Missing required fields (FullName, Email, Role, or Password)'
      });
      continue;
    }

    // Check for duplicate email
    if (existingEmails.has(normalizedEmail)) {
      results.failed++;
      results.errors.push({
        email: user.Email,
        error: 'User with this email already exists'
      });
      continue;
    }

    // Validate password length
    if (user.Password.length < 6) {
      results.failed++;
      results.errors.push({
        email: user.Email,
        error: 'Password must be at least 6 characters'
      });
      continue;
    }

    // Validate role
    const validRoles = ['Admin', 'Stakeholder', 'Sub-stakeholder', 'Team Leader'];
    if (!validRoles.includes(user.Role)) {
      results.failed++;
      results.errors.push({
        email: user.Email,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
      continue;
    }

    // Determine role based on manager email if not explicitly set
    let role = user.Role;
    if (role === 'Sub-stakeholder' && !normalizedManagerEmail) {
      results.failed++;
      results.errors.push({
        email: user.Email,
        error: 'Manager email is required for Sub-stakeholders'
      });
      continue;
    }

    // Generate user ID
    const newUserId = generateUserId();

    // Hash password
    const hashedPassword = await bcrypt.hash(user.Password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    // Create user row
    const userRow = [
      newUserId,                    // UserID (A)
      user.FullName,                // FullName (B)
      normalizedEmail,              // Email (C)
      role,                         // Role (D)
      normalizedManagerEmail,       // ManagerEmail (E)
      '',                           // TeamID (F) - will be resolved by admin
      user.TeamName || '',          // TeamName (G)
      'true',                       // Active (H) - auto-activate for bulk upload
      'true',                       // CanCreateFollowUp (I)
      'true',                       // CanCloseTask (J)
      now,                          // CreatedAt (K)
      now,                          // UpdatedAt (L)
      hashedPassword,               // Password (M) - bcrypt hash
      'approved',                   // ApprovalStatus (N) - auto-approved for bulk upload
      req.user?.email || 'system',  // RequestedBy (O)
      now,                          // RequestedAt (P)
      req.user?.email || 'system',  // ApprovedBy (Q)
      now                           // ApprovedAt (R)
    ];

    rowsToAppend.push(userRow);
    existingEmails.add(normalizedEmail); // Prevent duplicates within the same batch
    results.success++;
  }

  // Append all valid users to Google Sheets
  if (rowsToAppend.length > 0) {
    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'users', rowsToAppend);

    if (!success) {
      throw new InternalServerError("Failed to append users to Google Sheets");
    }

    // Also write to Firestore for Admin Panel visibility
    for (let i = 0; i < rowsToAppend.length; i++) {
      const row = rowsToAppend[i];
      try {
        await firestoreAdmin.collection('users').doc(row[2]).set({
          UserID: row[0],
          FullName: row[1],
          Email: row[2],
          Role: row[3],
          ManagerEmail: row[4],
          TeamID: row[5],
          TeamName: row[6],
          Active: row[7] === 'true',
          CanCreateFollowUp: row[8] === 'true',
          CanCloseTask: row[9] === 'true',
          CreatedAt: row[10],
          UpdatedAt: row[11],
          Password: row[12],
          ApprovalStatus: row[13],
          RequestedBy: row[14],
          RequestedAt: row[15],
          ApprovedBy: row[16],
          ApprovedAt: row[17],
          TeamIDs: row[5] ? [row[5]] : [],
          TeamNames: row[6] ? [row[6]] : [],
        });
      } catch (firestoreErr) {
        console.error(`Failed to write user ${row[2]} to Firestore:`, firestoreErr);
        // Non-fatal: Sheets is the source of truth
      }
    }
  }

  res.json({
    success: true,
    message: `Bulk upload completed: ${results.success} users added, ${results.failed} failed`,
    results
  });
}
