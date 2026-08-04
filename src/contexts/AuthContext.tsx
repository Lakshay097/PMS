import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types/index';
import { login, mapUserResponseToUser, refreshToken as refreshTokenApi } from '../api/auth';
import { logger } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider component to manage authentication state
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user, token, and refresh token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedRefreshToken = localStorage.getItem('refresh_token');
    const storedUser = localStorage.getItem('PMS_user');

    if (storedToken && storedUser) {
      try {
        // Validate token by checking if it's expired
        const tokenPayload = JSON.parse(atob(storedToken.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Check if token is expired (access tokens expire in 1 hour)
        if (tokenPayload.exp && tokenPayload.exp < currentTime) {
          logger.warn('Stored access token is expired, clearing auth data');
          clearAuthData();
          setIsLoading(false);
          return;
        }

        setToken(storedToken);
        setRefreshToken(storedRefreshToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        logger.error('Failed to parse stored user or token:', error);
        clearAuthData();
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(false);
  }, []);

  const clearAuthData = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('PMS_auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('PMS_user');
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setIsLoading(false);
  };

  /**
   * Login function using the API
   */
  const handleLogin = async (email: string, password: string) => {
    // Clear any stale session data before establishing new session
    clearAuthData();

    const data = await login({ email, password });
    const mappedUser = mapUserResponseToUser(data.user);

    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUser(mappedUser);

    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('PMS_auth_token', data.token);
    localStorage.setItem('refresh_token', data.refreshToken);
    localStorage.setItem('PMS_user', JSON.stringify(mappedUser));
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
