import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';

const VOTE_TOTAL = 10;

export default function Picks() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data: winnerData } = useQuery({
    queryKey: ['winner-pick', id],
    queryFn: () => apiGet<{ pick: { contestantId: number; name: string } | null; locked: boolean }>(`/predictions/winner/${id}`),
    enabled: id > 0,
  });

  const { data: episodesData } = useQuery({
    queryKey: ['episodes', id],
    queryFn: () => apiGet<{ episodes: { id: number; episodeNumber: number; title: string | null; lockAt: string }[] }>(`/leagues/${id}/episodes`),
    enabled: id > 0,
  });

  const setWinner = useMutation({
    mutationFn: (contestantId: number) => apiPost(`/predictions/winner/${id}`, { contestantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['winner-pick', id] }),
  });

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && id !== currentLeague.id) return <Navigate to={`/picks/${currentLeague.id}`} replace />;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ocean-900">Picks</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>

      <section className="rounded-xl border border-sand-300 bg-sand-50 p-4 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-2">Winner pick</h2>
        {winnerData?.locked && <p className="text-amber-700 text-sm mb-2">Locked.</p>}
        {winnerData?.pick && <p className="text-ocean-800">Your pick: <strong>{winnerData.pick.name}</strong></p>}
        {!winnerData?.locked && (
          <WinnerPickForm leagueId={id} currentId={winnerData?.pick?.contestantId} onSave={(cid) => setWinner.mutate(cid)} />
        )}
      </section>

      <section>
        <h2 className="font-semibold text-ocean-800 mb-2">Episode vote predictions</h2>
        <p className="text-ocean-600 text-sm mb-4">Allocate {VOTE_TOTAL} votes across contestants you think will be voted out. Configure per episode when available.</p>
        {episodesData?.episodes?.length ? (
          <ul className="space-y-2">
            {episodesData.episodes.map((ep) => (
              <li key={ep.id}>
                <Link to={`/picks/${id}/episode/${ep.id}`} className="text-ember-600 hover:underline">
                  Episode {ep.episodeNumber} {ep.title ?? ''} (lock: {new Date(ep.lockAt).toLocaleString()})
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ocean-600">No episodes yet.</p>
        )}
      </section>
    </div>
  );
}

function WinnerPickForm({
  leagueId,
  currentId,
  onSave,
}: {
  leagueId: number;
  currentId?: number;
  onSave: (contestantId: number) => void;
}) {
  const { data } = useQuery({
    queryKey: ['contestants', leagueId],
    queryFn: () => apiGet<{ contestants: { id: number; name: string }[] }>(`/leagues/${leagueId}/contestants`),
  });
  const [value, setValue] = useState(currentId ?? 0);
  return (
    <div>
      <select
        value={value || ''}
        onChange={(e) => setValue(parseInt(e.target.value, 10))}
        className="rounded border border-sand-300 px-3 py-2"
      >
        <option value="">Choose winner…</option>
        {(data?.contestants ?? []).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => value && onSave(value)}
        className="ml-2 rounded bg-ember-500 px-4 py-2 text-white text-sm hover:bg-ember-600"
      >
        Save
      </button>
    </div>
  );
}
