import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';

export default function Profile() {
  const [searchParams] = useSearchParams();
  const forceChange = searchParams.get('changePassword') === '1';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { username: string; mustChangePassword: boolean } }>('/auth/me'),
  });

  const changeMut = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiPost('/auth/change-password', body),
    onSuccess: () => {
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  useEffect(() => {
    if (forceChange) setMessage('Please set a new password.');
  }, [forceChange]);

  return (
    <div className="py-8 max-w-md">
      <h1 className="text-2xl font-bold text-ocean-900 mb-6">Profile</h1>
      {data?.user && <p className="text-ocean-700 mb-4">Logged in as <strong>{data.user.username}</strong></p>}
      <section className="rounded-xl border border-sand-300 bg-sand-50 p-4">
        <h2 className="font-semibold text-ocean-800 mb-3">Change password</h2>
        {message && <p className={`text-sm mb-2 ${message.startsWith('Password') ? 'text-green-700' : 'text-red-600'}`}>{message}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changeMut.mutate({ currentPassword, newPassword });
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-ocean-800 mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded border border-sand-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ocean-800 mb-1">New password (min 8 characters)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded border border-sand-300 px-3 py-2"
              minLength={8}
            />
          </div>
          <button type="submit" className="rounded-lg bg-ember-500 px-4 py-2 text-white font-medium hover:bg-ember-600" disabled={changeMut.isPending}>
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}
