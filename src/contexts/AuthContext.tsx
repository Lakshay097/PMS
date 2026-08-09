import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types/index';
import { login, mapUserResponseToUser, refreshToken as refreshTokenApi } from '../api/auth';
import { logger } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Synchronous helpers — run once at module load time so useState initialisers
// can read a fully-resolved auth state without needing a useEffect round-trip.
// ---------------------------------------------------------------------------
function readStoredAuth(): { token: string | null; refreshToken: string | null; user: User | null } {
  try {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser  = localStorage.getItem('PMS_user');

    if (!storedToken || !storedUser) {
      return { token: null, refreshToken: null, user: null };
    }

    // Validate JWT expiry synchronously
    const tokenPayload = JSON.parse(atob(storedToken.split('.')[1]));
    const currentTime  = Math.floor(Date.now() / 1000);
    if (tokenPayload.exp && tokenPayload.exp < currentTime) {
      logger.warn('Stored access token is expired — clearing on init');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('PMS_auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('PMS_user');
      return { token: null, refreshToken: null, user: null };
    }

    return {
      token:        storedToken,
      refreshToken: localStorage.getItem('refresh_token'),
      user:         JSON.parse(storedUser) as User,
    };
  } catch {
    return { token: null, refreshToken: null, user: null };
  }
}

/**
 * AuthProvider component to manage authentication state
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Single lazy read — runs once synchronously before the first render so
  // auth state is already populated without a useEffect round-trip.
  const [authState] = useState(readStoredAuth);

  const [user, setUser]                 = useState<User | null>(authState.user);
  const [token, setToken]               = useState<string | null>(authState.token);
  const [refreshToken, setRefreshToken] = useState<string | null>(authState.refreshToken);
  // Auth is resolved synchronously from localStorage — no async gate needed.
  const [isLoading, setIsLoading]       = useState(false);

  const clearAuthData = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('PMS_auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('PMS_user');
    localStorage.removeItem('PMS_active_user_email');
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setIsLoading(false);
  };

  /**
   * Login function using the API.
   * Does NOT clear React auth state before the request succeeds — clearing first
   * flipped isAuthenticated off/on and raced in-flight database loads into empty data.
   */
  const handleLogin = async (email: string, password: string): Promise<User> => {
    const data = await login({ email, password });
    const mappedUser = mapUserResponseToUser(data.user);

    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('PMS_auth_token', data.token);
    localStorage.setItem('refresh_token', data.refreshToken);
    localStorage.setItem('PMS_user', JSON.stringify(mappedUser));

    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUser(mappedUser);

    return mappedUser;
  };

  /**
   * Logout function
   */
  const handleLogout = () => {
    clearAuthData();
  };

  /**
   * Refresh access token using refresh token
   */
  const handleRefreshAccessToken = async () => {
    if (!refreshToken) {
      logger.warn('No refresh token available, cannot refresh access token');
      handleLogout();
      return;
    }

    try {
      const data = await refreshTokenApi({ refreshToken });
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('PMS_auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      logger.log('Access token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      handleLogout();
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    token,
    refreshToken,
    isAuthenticated: !!user && !!token,
    isLoading,
    login: handleLogin,
    logout: handleLogout,
    refreshAccessToken: handleRefreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook to use the AuthContext
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
