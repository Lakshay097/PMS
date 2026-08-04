const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('auth_token'); 
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