import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

type Row = { userId: number; username: string; total: number };

export default function Leaderboard() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const id = parseInt(leagueId ?? '0', 10);

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', id],
    queryFn: () => apiGet<{ leaderboard: Row[] }>(`/leaderboard/${id}`),
    enabled: id > 0,
  });

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (isLoading) return <div className="py-8">Loading…</div>;

  const rows = data?.leaderboard ?? [];

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ocean-900">Leaderboard</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>
      <div className="rounded-xl border border-sand-300 bg-sand-50 overflow-hidden">
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
                <td className="p-3 font-medium">{r.username}</td>
                <td className="p-3 text-right">{Number(r.total).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
