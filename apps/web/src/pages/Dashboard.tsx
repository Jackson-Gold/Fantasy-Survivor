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
    <div className="card-tribal p-6 bg-gradient-to-br from-ocean-800 to-ocean-900 text-white border-0">
      <p className="text-sm text-white/80 mb-1">Next lock</p>
      <p className="text-ocean-200 text-xs mb-2">Wednesday 8:00 PM ET</p>
      <p className="font-display text-4xl tracking-wide">{days}d {hours}h</p>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => apiGet<{ leagues: League[] }>('/leagues'),
  });
  const leagues = data?.leagues ?? [];

  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="text-ocean-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="font-display text-3xl md:text-4xl tracking-wide text-ocean-900 mb-2">Dashboard</h1>
      <p className="text-ocean-600 mb-8">Your leagues and this week’s lock countdown.</p>

      <div className="grid gap-4 md:grid-cols-2 mb-10">
        <LockCountdown />
      </div>

      <h2 className="text-lg font-semibold text-ocean-800 mb-4">Your leagues</h2>
      {leagues.length === 0 ? (
        <div className="card-tribal p-8 text-center text-ocean-600">
          You’re not in any league yet. An admin can add you.
        </div>
      ) : (
        <ul className="space-y-4">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link
                to={`/team/${l.id}`}
                className="card-tribal block p-5 hover:shadow-card-hover transition-shadow"
              >
                <span className="font-semibold text-ocean-900">{l.name}</span>
                {l.seasonName && <span className="text-ocean-600 ml-2">— {l.seasonName}</span>}
              </Link>
              <div className="flex flex-wrap gap-3 mt-2 ml-1">
                <Link to={`/team/${l.id}`} className="text-ember-600 hover:text-ember-700 font-medium text-sm">My Team</Link>
                <Link to={`/picks/${l.id}`} className="text-jungle-600 hover:text-jungle-700 font-medium text-sm">Picks</Link>
                <Link to={`/trades/${l.id}`} className="text-ocean-600 hover:text-ocean-700 font-medium text-sm">Trades</Link>
                <Link to={`/leaderboard/${l.id}`} className="text-ocean-600 hover:text-ocean-700 font-medium text-sm">Leaderboard</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
