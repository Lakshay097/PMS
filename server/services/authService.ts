import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { BadRequestError, UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { firestoreAdmin } from './firebaseAdmin';
import { convertTimestampsToISO } from '../lib/firestoreUtils';

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
  refreshToken: string;
  user: UserResponse;
  expiresIn: string;
  refreshTokenExpiresIn: string;
}

/**
 * Generates a unique user ID
 */
export function generateUserId(): string {
  return 'USR-' + Math.floor(config.USER_ID_MIN + Math.random() * (config.USER_ID_MAX - config.USER_ID_MIN));
}

/**
 * Creates a JWT access token for a user (short-lived)
 */
export function createAccessToken(
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
    { expiresIn: config.JWT_EXPIRATION_SECONDS + 's' as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Creates a JWT refresh token for a user (long-lived)
 */
export function createRefreshToken(
  email: string,
  userId: string
): string {
  return jwt.sign(
    {
      email: email.toLowerCase(),
      userId,
      type: 'refresh'
    },
    config.JWT_SECRET,
    { expiresIn: '30d' as jwt.SignOptions['expiresIn'] } // 30 days
  );
}

/**
 * Creates a JWT token for a user (legacy, for backward compatibility)
 * @deprecated Use createAccessToken and createRefreshToken instead
 */
export function createToken(
  email: string,
  userId: string,
  role: string,
  fullName: string
): string {
  return createAccessToken(email, userId, role, fullName);
}

/**
 * Performs user login — reads from Firestore (same source as all other endpoints).
 * Previously read from Google Sheets, which caused login failures when the
 * SA clock drifted and the Sheets token fetch returned invalid_grant.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  if (!email || !password) {
    throw new BadRequestError("Email and password are required");
  }

  const normalizedEmail = email.toLowerCase();

  // Read directly from Firestore — doc ID is the lowercased email
  const docRef = firestoreAdmin.collection('users').doc(normalizedEmail);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const user = convertTimestampsToISO(snap.data() as Record<string, any>);

  // Check active status — stored as boolean or string in Firestore
  const activeValue = user.Active;
  if (activeValue !== true && activeValue !== 'true' && activeValue !== 'TRUE') {
    throw new UnauthorizedError("Account is not active. Please wait for admin approval.");
  }

  // Check approval status
  if (user.ApprovalStatus && user.ApprovalStatus !== 'approved') {
    throw new UnauthorizedError("Account is not active. Please wait for admin approval.");
  }

  const storedPassword: string | undefined = user.Password;
  if (!storedPassword) {
    throw new UnauthorizedError("Account has no password set. Please contact your administrator.");
  }

  const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
  let passwordMatches = false;
  if (isBcryptHash) {
    passwordMatches = await bcrypt.compare(password, storedPassword);
  } else {
    // Legacy plaintext fallback
    passwordMatches = password === storedPassword;
  }

  if (!passwordMatches) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const userId   = user.UserID   || '';
  const fullName = user.FullName || '';
  const role     = user.Role     || '';
  const teamId   = user.TeamID   || (Array.isArray(user.TeamIDs)   && user.TeamIDs.length   > 0 ? user.TeamIDs[0]   : '');
  const teamName = user.TeamName || (Array.isArray(user.TeamNames) && user.TeamNames.length > 0 ? user.TeamNames[0] : '');

  logger.info(`[login] Firestore login success for ${normalizedEmail}, role=${role}`);

  const accessToken  = createAccessToken(normalizedEmail, userId, role, fullName);
  const refreshToken = createRefreshToken(normalizedEmail, userId);

  return {
    token: accessToken,
    refreshToken,
    user: {
      email: normalizedEmail,
      UserID: userId,
      Role: role,
      FullName: fullName,
      TeamID: teamId,
      TeamName: teamName,
      Active: true,
    },
    expiresIn: config.JWT_EXPIRATION_SECONDS + 's',
    refreshTokenExpiresIn: '30d',
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

/**
 * Refreshes a JWT access token using a refresh token
 * @param refreshToken - The refresh token
 * @returns New access token and refresh token, or null if invalid
 */
export async function refreshAccessTokenFromRefreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string; expiresIn: string } | null> {
  try {
    const decoded = jwt.verify(refreshToken, config.JWT_SECRET) as any;

    // Verify this is a refresh token
    if (decoded.type !== 'refresh') {
      logger.warn('Invalid refresh token: not a refresh token type');
      return null;
    }

    // Re-read current role/fullName from Firestore so the new access token
    // always reflects the latest user data (role changes take effect immediately).
    let role = decoded.role || '';
    let fullName = decoded.fullName || '';
    try {
      const snap = await firestoreAdmin.collection('users').doc(decoded.email).get();
      if (snap.exists) {
        const u = convertTimestampsToISO(snap.data() as Record<string, any>);
        role     = u.Role     || role;
        fullName = u.FullName || fullName;
      }
    } catch (fsErr) {
      logger.warn('[refreshToken] Firestore lookup failed, using token values:', fsErr);
    }

    const newAccessToken  = createAccessToken(decoded.email, decoded.userId, role, fullName);
    const newRefreshToken = createRefreshToken(decoded.email, decoded.userId);

    return {
      token: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: config.JWT_EXPIRATION_SECONDS + 's'
    };
  } catch (err) {
    logger.warn('Invalid refresh token:', err);
    return null;
  }
}

/**
 * Refreshes a JWT token (creates a new token with same user data)
 * @deprecated Use refreshAccessTokenFromRefreshToken instead
 */
export function refreshToken(email: string, userId: string, role: string, fullName: string): { token: string; expiresIn: string } {
  const newToken = createToken(email, userId, role, fullName);
  return {
    token: newToken,
    expiresIn: config.JWT_EXPIRES_IN
  };
}
