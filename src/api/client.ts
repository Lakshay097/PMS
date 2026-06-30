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
  return localStorage.getItem('auth_token');
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
