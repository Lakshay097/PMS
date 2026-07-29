/**
 * API Client for making HTTP requests
 * Handles authentication, error handling, and request/response transformation
 */

import { logger } from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const DEFAULT_TIMEOUT = 15000; // 15 seconds (was working before)
const MAX_RETRIES = 3; // Maximum number of retries

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API request options
 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  skipAuth?: boolean;
}

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('PMS_auth_token') || localStorage.getItem('auth_token');
}

/**
 * Get refresh token from localStorage
 */
function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

/**
 * Set auth token in localStorage
 */
function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('PMS_auth_token', token);
}

/**
 * Set refresh token in localStorage
 */
function setRefreshToken(token: string): void {
  localStorage.setItem('refresh_token', token);
}

/**
 * Clear auth tokens from localStorage
 */
function clearAuthTokens(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('PMS_auth_token');
  localStorage.removeItem('refresh_token');
}

// Track in-flight refresh to prevent race conditions
let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh access token using refresh token
 * Uses a single in-flight refresh pattern to prevent race conditions
 */
async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    logger.log('Token refresh already in progress, waiting...');
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    logger.warn('No refresh token available');
    return false;
  }

  // Start the refresh and store the promise
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        logger.warn('Failed to refresh access token');
        return false;
      }

      const data = await response.json();
      setAuthToken(data.token);
      setRefreshToken(data.refreshToken);
      logger.log('Access token refreshed successfully');
      return true;
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      return false;
    } finally {
      // Clear the promise after completion (success or failure)
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Make an API request with error handling, authentication, and retry logic
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    skipAuth = false,
  } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  // Prepare headers
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add auth token if not skipped
  if (!skipAuth) {
    const token = getAuthToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  // Retry logic with exponential backoff
  let lastError: Error | null = null;
  let shouldRetryWithRefresh = false;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Prepare request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const requestOptions: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal,
      };

      if (body) {
        requestOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      let data: any;
      if (isJson) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Handle 401 Unauthorized - attempt silent refresh
      if (response.status === 401 && !skipAuth) {
        if (!shouldRetryWithRefresh) {
          logger.warn('Received 401 response, attempting silent token refresh');
          const refreshSuccess = await refreshAccessToken();
          
          if (refreshSuccess) {
            // Update headers with new token and retry once
            requestHeaders['Authorization'] = `Bearer ${getAuthToken()}`;
            shouldRetryWithRefresh = true;
            attempt--; // Retry this attempt with new token
            continue;
          } else {
            // Refresh failed, clear tokens and redirect to login
            clearAuthTokens();
            window.location.href = '/login';
            throw new ApiError('Session expired. Please log in again.', 401, data);
          }
        } else {
          // Already retried with refreshed token but still got 401
          // Clear tokens and redirect to login
          logger.warn('Received 401 after token refresh, clearing tokens and redirecting');
          clearAuthTokens();
          window.location.href = '/login';
          throw new ApiError('Session expired. Please log in again.', 401, data);
        }
      }

      // Handle error responses
      if (!response.ok) {
        // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw new ApiError(
            data?.error || data || 'Request failed',
            response.status,
            data
          );
        }
        // Retry on server errors (5xx), timeout (408), and rate limit (429)
        throw new ApiError(
          data?.error || data || 'Request failed',
          response.status,
          data
        );
      }

      return data as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Don't retry on the last attempt
      if (attempt === MAX_RETRIES) {
        break;
      }

      // Don't retry on client errors (except timeout and rate limit)
      if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 408 && error.statusCode !== 429) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`Request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  if (lastError instanceof Error) {
    if (lastError.name === 'AbortError') {
      throw new ApiError('Request timeout after retries', 408);
    }
    if (lastError instanceof ApiError) {
      throw lastError;
    }
  }

  throw new ApiError('Network error or server unavailable after retries', 0);
}

/**
 * Convenience methods for common HTTP operations
 */
export const api = {
  get: <T = any>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'PUT', body }),

  delete: <T = any>(endpoint: string, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),

  patch: <T = any>(endpoint: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(endpoint, { ...options, method: 'PATCH', body }),
};

/**
 * Notify server of a data change for immediate SSE broadcast
 * Non-critical — failures are logged but don't block the UI
 */
export async function notifyChange(
  collection: string,
  action: 'created' | 'updated' | 'deleted',
  entityId: string
): Promise<void> {
  try {
    await api.post('/events/notify', {
      collection,
      action,
      entityId
    });
  } catch {
    // Non-critical — polling fallback will catch it
    // Do not throw, do not block the UI
    logger.warn('[SSE] Failed to broadcast change notification');
  }
}
