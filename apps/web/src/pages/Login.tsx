import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      apiPost<{ user: { mustChangePassword?: boolean } }>('/auth/login', body),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data);
      if (data.user.mustChangePassword) navigate('/profile?changePassword=1');
      else navigate('/dashboard');
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mx-auto max-w-sm py-12">
      <h2 className="text-2xl font-bold text-ocean-900 mb-6">Log in</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          login.mutate({ username, password });
        }}
      >
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-sand-300 bg-white px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-sand-300 bg-white px-3 py-2"
            required
          />
        </div>
        <button type="submit" className="w-full rounded-lg bg-ember-500 py-2 text-white font-medium hover:bg-ember-600" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
