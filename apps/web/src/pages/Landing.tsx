import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export default function Landing() {
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => apiGet<{ user?: unknown }>('/auth/me'), retry: false });
  const loggedIn = !!data?.user;

  return (
    <div className="py-12 md:py-16 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-wide text-ocean-900 mb-4">
          FANTASY SURVIVOR
        </h1>
        <p className="text-xl md:text-2xl text-ocean-700 mb-4 font-medium">
          Pick your tribe. Predict the vote. Outwit, outplay, outscore.
        </p>
        <p className="text-ocean-600 mb-10 max-w-xl mx-auto">
          Build a roster, lock in your winner, and earn points as the season unfolds.
        </p>

        <div className="card-tribal p-8 md:p-10 text-left max-w-xl mx-auto">
          <h2 className="text-lg font-semibold text-ocean-900 mb-4">How it works</h2>
          <ul className="space-y-3 text-ocean-700">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-ember-500/20 text-ember-700 flex items-center justify-center text-sm font-semibold">1</span>
              <span>Build a roster of <strong>2–3 contestants</strong> and lock in your <strong>winner pick</strong>.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-jungle-500/20 text-jungle-700 flex items-center justify-center text-sm font-semibold">2</span>
              <span>Each week, allocate <strong>vote-out predictions</strong> before the deadline (Wednesday 8pm ET).</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-ocean-500/20 text-ocean-700 flex items-center justify-center text-sm font-semibold">3</span>
              <span>Earn points from outcomes and trades. Climb the <strong>leaderboard</strong>.</span>
            </li>
          </ul>
          <div className="mt-8 pt-6 border-t border-sand-200">
            {loggedIn ? (
              <Link to="/dashboard" className="btn-primary inline-block">
                Go to Dashboard
              </Link>
            ) : (
              <Link to="/login" className="btn-primary inline-block">
                Log in to play
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
