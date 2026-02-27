import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../lib/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const login = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiPost<{ user?: { mustChangePassword?: boolean } }>('/auth/login', body),
    onSuccess: (data) => {
      if (!data?.user) {
        setError('Invalid response from server. Check that the API URL is correct and CORS is configured.');
        return;
      }
      qc.setQueryData(['me'], data);
      if (data.user.mustChangePassword) navigate('/profile?changePassword=1');
      else navigate('/dashboard');
    },
    onError: (e: Error) => setError(e.message),
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
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
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
