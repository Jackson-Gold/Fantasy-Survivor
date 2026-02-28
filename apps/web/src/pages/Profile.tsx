import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';

type ActivityEntry = {
  id: number;
  timestamp: string;
  actionType: string;
  entityType: string;
  entityId: number | null;
  afterJson: Record<string, unknown> | null;
  metadataJson: Record<string, unknown> | null;
};

function formatAction(actionType: string): string {
  return actionType.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEntity(entityType: string): string {
  return entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function activitySummary(entry: ActivityEntry): string | null {
  const m = entry.metadataJson;
  const a = entry.afterJson;
  if (m && typeof m.leagueId === 'number') return `League ${m.leagueId}`;
  if (a && typeof a.username === 'string') return a.username;
  if (a && typeof a.name === 'string') return a.name;
  return null;
}

export default function Profile() {
  const [searchParams] = useSearchParams();
  const forceChange = searchParams.get('changePassword') === '1';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const qc = useQueryClient();

  const { data, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { username: string; mustChangePassword: boolean } }>('/auth/me'),
    retry: false,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiGet<{ activity: ActivityEntry[] }>('/activity'),
    retry: false,
  });

  const changeMut = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiPost('/auth/change-password', body),
    onSuccess: () => {
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  useEffect(() => {
    if (forceChange) setMessage('Please set a new password.');
  }, [forceChange]);

  const activity = activityData?.activity ?? [];

  if (meLoading) {
    return (
      <div className="py-8 max-w-lg">
        <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-2">Profile</h1>
        <p className="text-ocean-600">Loading…</p>
      </div>
    );
  }

  if (meError) {
    return (
      <div className="py-8 max-w-lg">
        <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-2">Profile</h1>
        <div className="card-tribal p-4 border-ember-200 bg-ember-50">
          <p className="text-ember-700">Session expired or invalid. Please log in again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-lg">
      <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-2">Profile</h1>
      {data?.user && (
        <p className="text-ocean-700 mb-6">
          Logged in as <strong>{data.user.username}</strong>
        </p>
      )}

      <section className="card-tribal p-4 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-3">Change password</h2>
        {message && (
          <p className={`text-sm mb-2 ${message.startsWith('Password') ? 'text-jungle-700' : 'text-ember-600'}`}>
            {message}
          </p>
        )}
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
              className="input-tribal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ocean-800 mb-1">New password (min 8 characters)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-tribal"
              minLength={8}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={changeMut.isPending}
          >
            Update password
          </button>
        </form>
      </section>

      <section className="card-tribal p-4">
        <h2 className="font-semibold text-ocean-800 mb-3">Recent activity</h2>
        {activityLoading ? (
          <p className="text-ocean-600 text-sm">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-ocean-600 text-sm">No recent activity.</p>
        ) : (
          <ul className="space-y-2">
            {activity.map((entry) => {
              const summary = activitySummary(entry);
              const time = new Date(entry.timestamp).toLocaleString(undefined, {
                dateStyle: 'short',
                timeStyle: 'short',
              });
              return (
                <li key={entry.id} className="text-sm border-b border-sand-200 last:border-0 pb-2 last:pb-0">
                  <span className="text-ocean-500">{time}</span>
                  <span className="text-ocean-800 ml-2">{formatAction(entry.actionType)}</span>
                  <span className="text-ocean-600 ml-1">— {formatEntity(entry.entityType)}</span>
                  {summary && <span className="text-ocean-600 ml-1">({summary})</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
