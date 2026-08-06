// API base URL resolution:
// - In production (Cloud Run) or any same-origin deployment, we want relative
//   URLs so requests go to the same host: /api/users, /api/tasks, etc.
// - VITE_API_BASE is only useful for local dev cross-origin scenarios, but the
//   Vite proxy already forwards /api/* to Express on port 3000, so we don't
//   need it at all.
// - We explicitly discard any absolute URL (http/https) that may have been
//   baked in by a stale build so it can never break a production deployment.
// - We also discard '/api' specifically: every call path already starts with
//   '/api/...' so prepending '/api' again would produce '/api/api/...' (404).
const _raw = import.meta.env.VITE_API_BASE ?? '';
const API_BASE = (_raw.startsWith('http') || _raw === '/api' || _raw === '/api/') ? '' : _raw;

// Track in-flight refresh to prevent race conditions
let refreshPromise: Promise<boolean> | null = null;
// Track consecutive failed refresh attempts to force logout
let failedRefreshAttempts = 0;

/**
 * Refresh access token using refresh token
 * Uses a single in-flight refresh pattern to prevent race conditions
 */
async function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    return false;
  }

  // Start the refresh and store the promise
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        failedRefreshAttempts++;
        // Force logout after 2 consecutive failed refresh attempts
        if (failedRefreshAttempts >= 2) {
          clearAuthTokens();
          window.location.href = '/login';
        }
        return false;
      }

      const data = await response.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('PMS_auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      failedRefreshAttempts = 0; // Reset counter on success
      return true;
    } catch (error) {
      failedRefreshAttempts++;
      // Force logout after 2 consecutive failed refresh attempts
      if (failedRefreshAttempts >= 2) {
        clearAuthTokens();
        window.location.href = '/login';
      }
      return false;
    } finally {
      // Clear the promise after completion (success or failure)
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function clearAuthTokens(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('PMS_auth_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('PMS_user');
}

async function request<T>(method: string, path: string, requestBody?: unknown): Promise<T> {
  let token = localStorage.getItem('PMS_auth_token') || localStorage.getItem('auth_token');
  
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    cache: 'no-store',
  });

  if (res.status === 401) {
    // Token is missing or expired — attempt silent refresh
    const refreshSuccess = await refreshAccessToken();
    
    if (refreshSuccess) {
      // Retry with new token
      token = localStorage.getItem('PMS_auth_token') || localStorage.getItem('auth_token');
      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
        cache: 'no-store',
      });
      
      if (!retryRes.ok) {
        const text = await retryRes.text().catch(() => '');
        throw new Error(`API ${method} ${path} failed: ${retryRes.status} ${text}`);
      }
      if (retryRes.status === 204) return undefined as T;
      return retryRes.json() as Promise<T>;
    } else {
      // Refresh failed, clear tokens and force re-login
      clearAuthTokens();
      window.location.href = '/login';
      throw new Error(`API ${method} ${path} failed: 401 Unauthorized — redirecting to login`);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:  <T>(p: string)               => request<T>('GET', p),
  post: <T>(p: string, b?: unknown)  => request<T>('POST', p, b),
  put:  <T>(p: string, b?: unknown)  => request<T>('PUT', p, b),
  del:  <T>(p: string)               => request<T>('DELETE', p),
};
