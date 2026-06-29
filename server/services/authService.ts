import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { InternalServerError, UnauthorizedError } from '../utils/AppError';
import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues } from './googleSheetsService';

/**
 * User response interface
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
 * Login response interface
 */
export interface LoginResponse {
  token: string;
  user: UserResponse;
  expiresIn: string;
}

/**
 * Generates a unique user ID
 * @returns User ID string
 */
export function generateUserId(): string {
  return 'USR-' + Math.floor(config.USER_ID_MIN + Math.random() * (config.USER_ID_MAX - config.USER_ID_MIN));
}

/**
 * Creates a JWT token for a user
 * @param email - User email
 * @param userId - User ID
 * @param role - User role
 * @param fullName - User full name
 * @returns JWT token
 */
export function createToken(
  email: string,
  userId: string,
  role: string,
  fullName: string
): string {
  return jwt.sign(
    {
      email: email.toLowerCase(),
      userId,
      role,
      fullName
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Performs user login
 * @param email - User email
 * @param password - User password
 * @returns Login response
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  if (!email || !password) {
    throw new InternalServerError("Email and password are required");
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

  // Fetch users from Google Sheets
  const usersRange = 'users!A:R';
  const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!users || users.length === 0) {
    throw new InternalServerError("Failed to fetch users");
  }

  const normalizedEmail = email.toLowerCase();
  let foundUser: any[] | null = null;

  // Skip header row (index 0) and find user by email (email is at index 2)
  for (let i = 1; i < users.length; i++) {
    const row = users[i];
    if (row[2] === normalizedEmail) {
      foundUser = row;
      break;
    }
  }

  if (!foundUser) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Check if user is active (Active is at index 7)
  const activeValue = foundUser[7];
  if (activeValue !== 'true' && activeValue !== 'TRUE' && activeValue !== true) {
    throw new UnauthorizedError("Account is not active. Please wait for admin approval.");
  }

  // Verify password (password is at index 12)
  const storedPassword = foundUser[12];
  const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
  
  let passwordMatches = false;
  let needsMigration = false;
  
  if (isBcryptHash) {
    passwordMatches = await bcrypt.compare(password, storedPassword);
  } else {
    // Migration: detect plaintext password and verify
    passwordMatches = password === storedPassword;
    if (passwordMatches) {
      needsMigration = true;
    }
  }

  if (!passwordMatches) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // One-time migration: re-hash plaintext passwords
  if (needsMigration) {
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    const hashedPassword = await bcrypt.hash(password, bcryptRounds);
    
    // Update the password in Google Sheets
    const rowIndex = users.indexOf(foundUser);
    foundUser[12] = hashedPassword; // Password column (M)
    
    const updateSuccess = await updateSheetValues(
      tokenData.accessToken,
      spreadsheetId,
      `users!A${rowIndex + 1}:R${rowIndex + 1}`,
      [foundUser]
    );
    
    if (!updateSuccess) {
      // Log warning but don't fail login
      console.error('Failed to migrate password to bcrypt for user:', normalizedEmail);
    }
  }

  // Extract user data from the row
  const userId = foundUser[0]; // UserID (A)
  const fullName = foundUser[1]; // FullName (B)
  const role = foundUser[3]; // Role (D)
  const teamId = foundUser[5]; // TeamID (F)
  const teamName = foundUser[6]; // TeamName (G)
  const active = foundUser[7] === 'true' || foundUser[7] === true; // Active (H)

  // Create JWT token
  const token = createToken(normalizedEmail, userId, role, fullName);

  const userResponse: UserResponse = {
    email: normalizedEmail,
    UserID: userId,
    Role: role,
    FullName: fullName,
    TeamID: teamId,
    TeamName: teamName,
    Active: active
  };

  return {
    token,
    user: userResponse,
    expiresIn: config.JWT_EXPIRES_IN
  };
}

/**
 * Verifies a JWT token
 * @param token - JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    return null;
  }
}
