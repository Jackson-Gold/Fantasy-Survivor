import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost, getApiBaseUrl, setToken } from '../lib/api';

function getLoginErrorMessage(apiBase: string): string {
  if (!apiBase) {
    return [
      'The app does not know your API URL, so the request never reached the backend.',
      '',
      'Fix: In Render, open your Static Site → Environment. Add:',
      '  Key: VITE_API_BASE_URL',
      '  Value: https://your-backend-service.onrender.com (no trailing slash)',
      'Save, then go to Manual Deploy → Deploy latest commit so the build runs with this variable.',
      '',
      'On the backend (Web Service), set CORS_ORIGINS to include this site’s URL (e.g. https://your-static-site.onrender.com).',
    ].join('\n');
  }
  return [
    'The server returned an empty or invalid response.',
    'Check that CORS_ORIGINS on the backend includes this site’s URL exactly (e.g. https://your-frontend.onrender.com).',
    'Also confirm the backend is running and the URL above is correct.',
  ].join('\n');
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiPost<{ user?: { mustChangePassword?: boolean }; token?: string }>('/auth/login', body),
    onSuccess: (data) => {
      if (!data?.user) {
        setError(getLoginErrorMessage(getApiBaseUrl()));
        return;
      }
      if (data.token) setToken(data.token);
      qc.setQueryData(['me'], { user: data.user });
      if (data.user.mustChangePassword) navigate('/profile?changePassword=1');
      else navigate('/dashboard');
    },
    onError: (e: Error) => {
      const msg = e.message || 'Request failed';
      setError(msg.includes('CORS_ORIGINS') ? msg : msg);
    },
  });

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-ocean-900 mb-2">
            FANTASY SURVIVOR
          </h1>
          <p className="text-ocean-700 text-lg">Enter the island. Outwit, outplay, outscore.</p>
        </div>

        <div className="card-tribal p-8 md:p-10">
          <h2 className="text-xl font-semibold text-ocean-900 mb-6">Sign in</h2>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              login.mutate({ username, password });
            }}
          >
            {error && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm whitespace-pre-line">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ocean-800 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-tribal"
                placeholder="Your username"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ocean-800 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-tribal"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-3.5"
              disabled={login.isPending}
            >
              {login.isPending ? 'Entering the island…' : 'Log in'}
            </button>
          </form>
          <p className="mt-6 text-center text-ocean-600 text-sm">
            <Link to="/" className="text-ember-600 hover:text-ember-700 font-medium">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
