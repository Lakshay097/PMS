// API base URL resolution:
// - In production (Cloud Run) or any same-origin deployment, we want relative
//   URLs so requests go to the same host: /api/users, /api/tasks, etc.
// - VITE_API_BASE is only useful for local dev cross-origin scenarios, but the
//   Vite proxy already forwards /api/* to Express on port 3000, so we don't
//   need it at all.
// - We explicitly discard any absolute URL (http/https) that may have been
//   baked in by a stale build so it can never break a production deployment.
const _raw = import.meta.env.VITE_API_BASE ?? '';
const API_BASE = _raw.startsWith('http') ? '' : _raw;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('PMS_auth_token') || localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Token is missing or expired — clear stale tokens and force re-login
    // so the user sees the login page instead of an empty dashboard.
    localStorage.removeItem('auth_token');
    localStorage.removeItem('PMS_auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('PMS_user');
    window.location.href = '/login';
    throw new Error(`API ${method} ${path} failed: 401 Unauthorized — redirecting to login`);
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
