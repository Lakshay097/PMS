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
    if (row[2] === normalizedEmail) { // Email is in column 3 (index 2)
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

  // Mirror into Firestore so the Admin Panel (which reads Firestore) can see this pending request.
  // Password is stored here too so that the background Firestore→Sheets sync never overwrites
  // column M with an empty string.
  try {
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
  } catch (firestoreErr) {
    console.error("Failed to mirror pending user into Firestore:", firestoreErr);
    // Don't fail the whole request if this mirror write fails - Sheets is still source of truth
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

  // Keep Firestore in sync so the background Firestore→Sheets sync doesn't
  // overwrite column M with the old hash on the next 5-minute flush.
  try {
    await firestoreAdmin.collection('users').doc(normalizedEmail).set({
      Password: hashedPassword,
      UpdatedAt: now,
    }, { merge: true });
  } catch (firestoreErr) {
    console.error("Failed to mirror password change into Firestore:", firestoreErr);
    // Non-fatal: Sheets is already updated, Firestore will be corrected on next full sync
  }

  res.json({
    success: true,
    message: "Password changed successfully"
  });
}


// ─── SuperAdmin endpoints ──────────────────────────────────────────────────

/**
 * POST /api/superadmin/reveal-password
 * SuperAdmin-only: returns the stored password value for a user.
 * For bcrypt hashes the raw hash is returned (it IS the stored value).
 * Plaintext passwords are returned as-is.
 */
export async function revealPasswordHandler(req: AuthRequest, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    throw new BadRequestError("email is required");
  }

  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google Sheets");
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    throw new InternalServerError("Spreadsheet ID not found");
  }

  const usersRange = 'users!A:R';
  const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!users || users.length === 0) {
    throw new InternalServerError("Failed to fetch users");
  }

  const normalizedEmail = email.toLowerCase().trim();
  let foundRow: any[] | null = null;

  for (let i = 1; i < users.length; i++) {
    if ((users[i][2] || '').toLowerCase() === normalizedEmail) {
      foundRow = users[i];
      break;
    }
  }

  if (!foundRow) {
    throw new NotFoundError("User not found");
  }

  const storedPassword: string = foundRow[12] || '';
  const isBcryptHash =
    storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');

  // Also try Firestore in case Sheets value is empty but Firestore has it
  let firestorePassword: string | null = null;
  try {
    const doc = await firestoreAdmin.collection('users').doc(normalizedEmail).get();
    if (doc.exists) {
      firestorePassword = doc.data()?.Password || null;
    }
  } catch (_) { /* non-fatal */ }

  res.json({
    success: true,
    email: normalizedEmail,
    fullName: foundRow[1] || '',
    storedPasswordSheets: storedPassword || null,
    storedPasswordFirestore: firestorePassword,
    isBcryptHash,
    note: isBcryptHash
      ? 'Password is bcrypt-hashed. The hash is shown as stored — no plaintext recovery is possible for hashed passwords. Use the force-set endpoint to overwrite it.'
      : 'Password is stored as plaintext (legacy account).',
  });
}

/**
 * POST /api/superadmin/update-user
 * SuperAdmin-only: directly update any field of a user in both Sheets and
 * Firestore. Accepted body fields: email (required, identifies the user),
 * plus any subset of: fullName, role, active, password (plaintext — will be
 * bcrypt-hashed before writing), managerEmail, teamId, teamName,
 * canCreateFollowUp, canCloseTask, approvalStatus.
 */
export async function superAdminUpdateUserHandler(req: AuthRequest, res: Response): Promise<void> {
  const {
    email,
    fullName,
    role,
    active,
    password,
    managerEmail,
    teamId,
    teamName,
    canCreateFollowUp,
    canCloseTask,
    approvalStatus,
    // Firestore-only arbitrary patch (any key/value pairs)
    firestorePatch,
  } = req.body;

  if (!email) {
    throw new BadRequestError("email is required");
  }

  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google Sheets");
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    throw new InternalServerError("Spreadsheet ID not found");
  }

  const usersRange = 'users!A:R';
  const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!users || users.length === 0) {
    throw new InternalServerError("Failed to fetch users");
  }

  const normalizedEmail = email.toLowerCase().trim();
  let userRowIndex = -1;
  let userRow: any[] | null = null;

  for (let i = 1; i < users.length; i++) {
    if ((users[i][2] || '').toLowerCase() === normalizedEmail) {
      userRowIndex = i;
      userRow = [...users[i]]; // clone
      break;
    }
  }

  if (!userRow) {
    throw new NotFoundError("User not found");
  }

  const now = new Date().toISOString();

  // Apply patches to Sheets row
  if (fullName !== undefined)          userRow[1]  = fullName;
  if (role !== undefined)              userRow[3]  = role;
  if (managerEmail !== undefined)      userRow[4]  = managerEmail.toLowerCase();
  if (teamId !== undefined)            userRow[5]  = teamId;
  if (teamName !== undefined)          userRow[6]  = teamName;
  if (active !== undefined)            userRow[7]  = String(active);
  if (canCreateFollowUp !== undefined) userRow[8]  = String(canCreateFollowUp);
  if (canCloseTask !== undefined)      userRow[9]  = String(canCloseTask);
  if (approvalStatus !== undefined)    userRow[13] = approvalStatus;

  // Hash new password before writing
  let newHashedPassword: string | undefined;
  if (password !== undefined && password !== '') {
    newHashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    userRow[12] = newHashedPassword;
  }

  userRow[11] = now; // UpdatedAt

  const success = await updateSheetValues(
    tokenData.accessToken,
    spreadsheetId,
    `users!A${userRowIndex + 1}:R${userRowIndex + 1}`,
    [userRow]
  );

  if (!success) {
    throw new InternalServerError("Failed to update user in Google Sheets");
  }

  // Mirror into Firestore
  const firestoreUpdate: Record<string, any> = { UpdatedAt: now };
  if (fullName !== undefined)          firestoreUpdate.FullName = fullName;
  if (role !== undefined)              firestoreUpdate.Role = role;
  if (managerEmail !== undefined)      firestoreUpdate.ManagerEmail = managerEmail.toLowerCase();
  if (teamId !== undefined)            firestoreUpdate.TeamID = teamId;
  if (teamName !== undefined)          firestoreUpdate.TeamName = teamName;
  if (active !== undefined)            firestoreUpdate.Active = active === true || active === 'true';
  if (canCreateFollowUp !== undefined) firestoreUpdate.CanCreateFollowUp = canCreateFollowUp === true || canCreateFollowUp === 'true';
  if (canCloseTask !== undefined)      firestoreUpdate.CanCloseTask = canCloseTask === true || canCloseTask === 'true';
  if (approvalStatus !== undefined)    firestoreUpdate.ApprovalStatus = approvalStatus;
  if (newHashedPassword !== undefined) firestoreUpdate.Password = newHashedPassword;
  // Merge arbitrary Firestore-only patch
  if (firestorePatch && typeof firestorePatch === 'object') {
    Object.assign(firestoreUpdate, firestorePatch);
  }

  try {
    await firestoreAdmin.collection('users').doc(normalizedEmail).set(firestoreUpdate, { merge: true });
  } catch (firestoreErr) {
    console.error("Failed to mirror superadmin update into Firestore:", firestoreErr);
  }

  res.json({
    success: true,
    message: "User updated successfully",
    updatedFields: Object.keys(firestoreUpdate),
  });
}

/**
 * GET /api/superadmin/all-users
 * SuperAdmin-only: returns all users including hashed passwords from Sheets
 * and Firestore for full visibility.
 */
export async function superAdminListUsersHandler(req: AuthRequest, res: Response): Promise<void> {
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    throw new InternalServerError("Failed to authenticate with Google Sheets");
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    throw new InternalServerError("Spreadsheet ID not found");
  }

  const usersRange = 'users!A:R';
  const rows = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!rows || rows.length === 0) {
    res.json({ success: true, users: [] });
    return;
  }

  // Skip header row
  const users = rows.slice(1).map(row => ({
    UserID:           row[0]  || '',
    FullName:         row[1]  || '',
    Email:            row[2]  || '',
    Role:             row[3]  || '',
    ManagerEmail:     row[4]  || '',
    TeamID:           row[5]  || '',
    TeamName:         row[6]  || '',
    Active:           row[7]  || '',
    CanCreateFollowUp: row[8] || '',
    CanCloseTask:     row[9]  || '',
    CreatedAt:        row[10] || '',
    UpdatedAt:        row[11] || '',
    // Password is included — SuperAdmin-only endpoint
    StoredPassword:   row[12] || '',
    ApprovalStatus:   row[13] || '',
    RequestedBy:      row[14] || '',
    RequestedAt:      row[15] || '',
    ApprovedBy:       row[16] || '',
    ApprovedAt:       row[17] || '',
    isBcryptHash: (row[12] || '').startsWith('$2b$') || (row[12] || '').startsWith('$2a$'),
  }));

  res.json({ success: true, users });
}
