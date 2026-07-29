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