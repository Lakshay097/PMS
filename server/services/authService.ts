import jwt from 'jsonwebtoken';
import { config } from '../config';
import { InternalServerError } from '../utils/AppError';

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
 * Performs user login (simplified for demo)
 * @param email - User email
 * @param password - User password
 * @returns Login response
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  if (!email || !password) {
    throw new InternalServerError("Email and password are required");
  }

  // Simple authentication - for demo purposes
  // In production, you should verify against a real database
  const userId = generateUserId();
  const normalizedEmail = email.toLowerCase();
  const fullName = email.split('@')[0];
  
  const token = createToken(normalizedEmail, userId, 'Admin', fullName);

  const userResponse: UserResponse = {
    email: normalizedEmail,
    UserID: userId,
    Role: 'Admin',
    FullName: fullName,
    TeamID: 'T-00',
    TeamName: 'Admin Team',
    Active: true
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
