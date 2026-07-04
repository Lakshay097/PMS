import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { BadRequestError, InternalServerError, UnauthorizedError } from '../utils/AppError';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';

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
 */
export function generateUserId(): string {
  return 'USR-' + Math.floor(config.USER_ID_MIN + Math.random() * (config.USER_ID_MAX - config.USER_ID_MIN));
}

/**
 * Creates a JWT token for a user
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
 * Performs user login — reads role from Google Sheets (source of truth).
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  if (!email || !password) {
    throw new BadRequestError("Email and password are required");
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

  const normalizedEmail = email.toLowerCase();
  let foundUser: any[] | null = null;

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

  // Check if user is active
  const activeValue = foundUser[7];
  if (activeValue !== 'true' && activeValue !== 'TRUE' && activeValue !== true) {
    throw new UnauthorizedError("Account is not active. Please wait for admin approval.");
  }

  const storedPassword: string | undefined = foundUser[12];
  if (!storedPassword) {
    throw new UnauthorizedError("Account has no password set. Please contact your administrator.");
  }

  const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');

  let passwordMatches = false;
  if (isBcryptHash) {
    passwordMatches = await bcrypt.compare(password, storedPassword);
  } else {
    passwordMatches = password === storedPassword;
  }

  if (!passwordMatches) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const userId   = foundUser[0]; // UserID (A)
  const fullName = foundUser[1]; // FullName (B)
  const role     = foundUser[3]; // Role (D)
  const teamId   = foundUser[5]; // TeamID (F)
  const teamName = foundUser[6]; // TeamName (G)
  const active   = foundUser[7] === 'true' || foundUser[7] === true;

  const token = createToken(normalizedEmail, userId, role, fullName);

  return {
    token,
    user: {
      email: normalizedEmail,
      UserID: userId,
      Role: role,
      FullName: fullName,
      TeamID: teamId,
      TeamName: teamName,
      Active: active,
    },
    expiresIn: config.JWT_EXPIRES_IN,
  };
}

/**
 * Verifies a JWT token
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    return null;
  }
}
