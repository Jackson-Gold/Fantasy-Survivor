import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { UserAvatar } from '../components/UserAvatar';

type Row = { userId: number; username: string; avatarUrl?: string | null; total: number };

type BreakdownRow = Row & {
  scoring_event: number;
  vote_prediction: number;
  winner_pick: number;
  trade: number;
};

export default function Leaderboard() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const id = parseInt(leagueId ?? '0', 10);
  const [tab, setTab] = useState<'overall' | 'category'>('overall');
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', id],
    queryFn: () => apiGet<{ leaderboard: Row[] }>(`/leaderboard/${id}`),
    enabled: id > 0,
  });

  const { data: breakdownData, isLoading: breakdownLoading } = useQuery({
    queryKey: ['leaderboard', id, 'breakdown'],
    queryFn: () => apiGet<{ leaderboard: BreakdownRow[] }>(`/leaderboard/${id}/breakdown`),
    enabled: id > 0 && tab === 'category',
  });

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && id !== currentLeague.id) return <Navigate to={`/leaderboard/${currentLeague.id}`} replace />;
  if (isLoading) return <div className="py-8">Loading…</div>;

  const rows = data?.leaderboard ?? [];
  const breakdownRows = breakdownData?.leaderboard ?? [];

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="font-display text-3xl tracking-wide text-ocean-900">Leaderboard</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>

      <div className="flex gap-2 mb-4 border-b border-sand-300">
        <button
          type="button"
          onClick={() => setTab('overall')}
          className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
            tab === 'overall' ? 'bg-ocean-800 text-white' : 'text-ocean-700 hover:bg-sand-200'
          }`}
        >
          Overall
        </button>
        <button
          type="button"
          onClick={() => setTab('category')}
          className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
            tab === 'category' ? 'bg-ocean-800 text-white' : 'text-ocean-700 hover:bg-sand-200'
          }`}
        >
          By category
        </button>
      </div>

      {tab === 'overall' && (
        <div className="card-tribal overflow-hidden">
          <table className="w-full">
            <thead className="bg-ocean-800 text-white">
              <tr>
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Player</th>
                <th className="text-right p-3">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-t border-sand-200">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar username={r.username} avatarUrl={r.avatarUrl} size="sm" />
                      <span className="font-medium">{r.username}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">{Number(r.total).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'category' && (
        <>
          {breakdownLoading ? (
            <div className="py-8 text-ocean-600">Loading…</div>
          ) : (
            <div className="card-tribal overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-ocean-800 text-white">
                  <tr>
                    <th className="text-left p-3">#</th>
                    <th className="text-left p-3">Player</th>
                    <th className="text-right p-3">Team</th>
                    <th className="text-right p-3">Votes</th>
                    <th className="text-right p-3">Winner</th>
                    <th className="text-right p-3">Trades</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.map((r, i) => (
                    <tr key={r.userId} className="border-t border-sand-200">
                      <td className="p-3">{i + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar username={r.username} avatarUrl={r.avatarUrl} size="sm" />
                          <span className="font-medium">{r.username}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">{Number(r.scoring_event).toFixed(0)}</td>
                      <td className="p-3 text-right">{Number(r.vote_prediction).toFixed(0)}</td>
                      <td className="p-3 text-right">{Number(r.winner_pick).toFixed(0)}</td>
                      <td className="p-3 text-right">{Number(r.trade).toFixed(0)}</td>
                      <td className="p-3 text-right font-medium">{Number(r.total).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
