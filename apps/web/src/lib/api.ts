const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return BASE ? `${BASE}${p}` : p;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const fullPath = path.startsWith('/api') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  const url = path.startsWith('http') ? path : apiUrl(fullPath);
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let err: { error?: string } = { error: res.statusText };
    if (text && text.trim()) {
      try {
        err = JSON.parse(text) as { error?: string };
      } catch {
        err.error = text.slice(0, 100) || res.statusText;
      }
    }
    throw new Error(err.error ?? res.statusText);
  }
  if (!text || !text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid response from server');
  }
}

export const apiGet = <T>(path: string) => api<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
