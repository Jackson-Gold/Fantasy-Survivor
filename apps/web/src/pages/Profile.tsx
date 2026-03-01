import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { ContestantAvatar } from '../components/ContestantAvatar';
import { UserAvatar } from '../components/UserAvatar';
import { useCurrentLeague } from '../hooks/useCurrentLeague';

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

type RosterItem = { id: number; contestantId: number; name: string; status: string };
type Trade = { id: number; status: string; note: string | null };
type Episode = { id: number; episodeNumber: number; title: string | null; lockAt: string };

export default function Profile() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { username: string; role?: string; avatarUrl?: string | null } }>('/auth/me'),
    retry: false,
  });

  const uploadAvatar = useMutation({
    mutationFn: (imageDataUrl: string) => apiPost<{ avatar_url: string }>('/profile/avatar', { image: imageDataUrl }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const { league: currentLeague } = useCurrentLeague();

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiGet<{ activity: ActivityEntry[] }>('/activity'),
    retry: false,
  });

  const { data: teamData } = useQuery({
    queryKey: ['teams', currentLeague?.id],
    queryFn: () => apiGet<{ roster: RosterItem[] }>(`/teams/${currentLeague!.id}`),
    enabled: !!currentLeague?.id,
  });

  const { data: winnerData } = useQuery({
    queryKey: ['predictions', 'winner', currentLeague?.id],
    queryFn: () => apiGet<{ pick: { name: string } | null }>(`/predictions/winner/${currentLeague!.id}`),
    enabled: !!currentLeague?.id,
  });

  const { data: episodesData } = useQuery({
    queryKey: ['leagues', currentLeague?.id, 'episodes'],
    queryFn: () => apiGet<{ episodes: Episode[] }>(`/leagues/${currentLeague!.id}/episodes`),
    enabled: !!currentLeague?.id,
  });

  const { data: tradesData } = useQuery({
    queryKey: ['trades', currentLeague?.id],
    queryFn: () => apiGet<{ trades: Trade[] }>(`/trades/${currentLeague!.id}`),
    enabled: !!currentLeague?.id,
  });

  const activity = activityData?.activity ?? [];
  const roster = teamData?.roster ?? [];
  const winnerPick = winnerData?.pick;
  const episodes = episodesData?.episodes ?? [];
  const nextEpisode = episodes.find((ep) => new Date(ep.lockAt) > new Date());
  const trades = tradesData?.trades ?? [];

  if (meLoading) {
    return (
      <div className="py-8 max-w-2xl mx-auto">
        <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-2">Profile</h1>
        <p className="text-ocean-600">Loading…</p>
      </div>
    );
  }

  if (meError) {
    return (
      <div className="py-8 max-w-2xl mx-auto">
        <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-2">Profile</h1>
        <div className="card-tribal p-4 border-ember-200 bg-ember-50">
          <p className="text-ember-700">Session expired or invalid. Please log in again.</p>
        </div>
      </div>
    );
  }

  const username = data?.user?.username ?? '';

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl) uploadAvatar.mutate(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="py-8 max-w-2xl mx-auto">
      <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-6">Profile</h1>

      <section className="card-tribal p-5 mb-6">
        <div className="flex items-center gap-4">
          <UserAvatar username={username} avatarUrl={data?.user?.avatarUrl} size="lg" />
          <div className="flex-1">
            <p className="font-semibold text-ocean-900 text-lg">{username}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-ocean-100 text-ocean-800">
              {data?.user?.role === 'admin' ? 'Admin' : 'Player'}
            </span>
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-ember-600 hover:underline"
              >
                {uploadAvatar.isPending ? 'Uploading…' : 'Upload profile photo'}
              </button>
              {uploadAvatar.isError && <span className="text-red-600 text-sm ml-2">{(uploadAvatar.error as Error).message}</span>}
            </div>
          </div>
        </div>
      </section>

      {!currentLeague ? (
        <p className="text-ocean-600 text-sm mb-6">No league set up yet. An admin must create a league first.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <section className="card-tribal p-4">
            <h2 className="font-semibold text-ocean-800 mb-3">My Team</h2>
            {roster.length === 0 ? (
              <p className="text-ocean-600 text-sm mb-3">No roster yet.</p>
            ) : (
              <ul className="space-y-2 mb-3">
                {roster.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-ocean-800">
                    <ContestantAvatar name={r.name} size="sm" />
                    <span>{r.name}{r.status !== 'active' && <span className="text-ocean-600 text-sm"> ({r.status})</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link to={`/team/${currentLeague.id}`} className="text-ember-600 hover:underline font-medium text-sm">
              Manage roster →
            </Link>
          </section>

          <section className="card-tribal p-4">
            <h2 className="font-semibold text-ocean-800 mb-3">Picks</h2>
            {winnerPick ? (
              <p className="text-ocean-800 text-sm mb-1 flex items-center gap-2">
                <ContestantAvatar name={winnerPick.name} size="sm" />
                <span>Winner pick: <strong>{winnerPick.name}</strong></span>
              </p>
            ) : (
              <p className="text-ocean-600 text-sm mb-1">No winner pick yet.</p>
            )}
            {nextEpisode && (
              <p className="text-ocean-600 text-xs mb-3">
                Next lock: Episode {nextEpisode.episodeNumber} — {new Date(nextEpisode.lockAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}
            <Link to={`/picks/${currentLeague.id}`} className="text-ember-600 hover:underline font-medium text-sm">
              Manage picks →
            </Link>
          </section>

          <section className="card-tribal p-4 sm:col-span-2">
            <h2 className="font-semibold text-ocean-800 mb-3">Trades</h2>
            {trades.length === 0 ? (
              <p className="text-ocean-600 text-sm mb-3">No trades yet.</p>
            ) : (
              <p className="text-ocean-800 text-sm mb-3">{trades.length} trade{trades.length !== 1 ? 's' : ''} in this league.</p>
            )}
            <Link to={`/trades/${currentLeague.id}`} className="text-ember-600 hover:underline font-medium text-sm">
              View trades →
            </Link>
          </section>
        </div>
      )}

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
