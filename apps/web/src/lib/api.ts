const BUILD_TIME_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const AUTH_TOKEN_KEY = 'fantasy_survivor_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

declare global {
  interface Window {
    __FANTASY_API_BASE__?: string;
  }
}

/** API base URL: build-time env, or runtime from config.json / window. */
function getApiBase(): string {
  if (BUILD_TIME_BASE) return BUILD_TIME_BASE;
  return (typeof window !== 'undefined' ? (window.__FANTASY_API_BASE__ ?? '') : '').replace(/\/$/, '');
}

function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function getApiBaseUrl(): string {
  return getApiBase();
}

/** Load runtime config from /config.json when build-time API URL is missing. Call before first API use. */
let configLoaded: Promise<void> | null = null;
export function ensureApiConfig(): Promise<void> {
  if (BUILD_TIME_BASE) return Promise.resolve();
  if (configLoaded) return configLoaded;
  configLoaded = fetch('/config.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((c: { apiBaseUrl?: string }) => {
      if (c?.apiBaseUrl?.trim()) {
        window.__FANTASY_API_BASE__ = c.apiBaseUrl.trim().replace(/\/$/, '');
      }
    })
    .catch(() => {});
  return configLoaded;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const fullPath = path.startsWith('/api') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  const url = path.startsWith('http') ? path : apiUrl(fullPath);
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const text = await res.text();
  if (res.status === 401) {
    clearToken();
  }
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
export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
