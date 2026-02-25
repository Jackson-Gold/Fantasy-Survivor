import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { getNextLockTime } from '../lib/lock';

type League = { id: number; name: string; seasonName?: string };

function LockCountdown() {
  const next = getNextLockTime();
  const now = new Date();
  const ms = next.getTime() - now.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return (
    <div className="rounded-xl bg-ocean-800 text-white p-4">
      <p className="text-sm opacity-90">Next lock (Wed 8pm ET)</p>
      <p className="text-2xl font-bold">{days}d {hours}h</p>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => apiGet<{ leagues: League[] }>('/leagues'),
  });
  const leagues = data?.leagues ?? [];

  if (isLoading) return <div className="py-8">Loading…</div>;

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold text-ocean-900 mb-6">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <LockCountdown />
      </div>
      <h2 className="text-lg font-semibold text-ocean-800 mb-3">Your leagues</h2>
      {leagues.length === 0 ? (
        <p className="text-ocean-700">You’re not in any league yet. An admin can add you.</p>
      ) : (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link
                to={`/team/${l.id}`}
                className="block rounded-xl border border-sand-300 bg-sand-50 p-4 hover:bg-sand-100"
              >
                <span className="font-medium">{l.name}</span>
                {l.seasonName && <span className="text-ocean-600 ml-2">— {l.seasonName}</span>}
              </Link>
              <div className="flex gap-2 mt-2 ml-2">
                <Link to={`/team/${l.id}`} className="text-ember-600 hover:underline text-sm">My Team</Link>
                <Link to={`/picks/${l.id}`} className="text-ember-600 hover:underline text-sm">Picks</Link>
                <Link to={`/trades/${l.id}`} className="text-ember-600 hover:underline text-sm">Trades</Link>
                <Link to={`/leaderboard/${l.id}`} className="text-ember-600 hover:underline text-sm">Leaderboard</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
