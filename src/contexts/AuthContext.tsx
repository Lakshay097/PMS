import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types/index';
import { login, mapUserResponseToUser } from '../api/auth';
import { logger } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider component to manage authentication state
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user and token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('PMS_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        logger.error('Failed to parse stored user:', error);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('PMS_user');
      }
    }

    setIsLoading(false);
  }, []);

  /**
   * Login function using the API
   */
  const handleLogin = async (email: string, password: string) => {
    const data = await login({ email, password });
    const mappedUser = mapUserResponseToUser(data.user);

    setToken(data.token);
    setUser(mappedUser);

    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('PMS_auth_token', data.token);
    localStorage.setItem('PMS_user', JSON.stringify(mappedUser));
  };

  /**
   * Logout function
   */
  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('PMS_auth_token');
    localStorage.removeItem('PMS_user');
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login: handleLogin,
    logout: handleLogout,
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
