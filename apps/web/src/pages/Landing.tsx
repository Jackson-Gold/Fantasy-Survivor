import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export default function Landing() {
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => apiGet<{ user: unknown }>('/auth/me'), retry: false });
  const loggedIn = !!data?.user;

  return (
    <div className="py-12 text-center">
      <h1 className="text-4xl font-bold text-ocean-900 mb-2">Fantasy Survivor</h1>
      <p className="text-ocean-800 text-lg mb-8">Pick your tribe. Predict the vote. Outwit, outplay, outscore.</p>
      <div className="rounded-2xl bg-sand-200/80 border border-sand-300 p-8 max-w-md mx-auto text-left">
        <p className="text-ocean-800 mb-4">
          Build a roster of 2–3 contestants, make weekly vote-out predictions, and lock in your winner pick. 
          Earn points as the season unfolds. Trades and leaderboards add the strategy.
        </p>
        {loggedIn ? (
          <Link to="/dashboard" className="inline-block rounded-lg bg-ember-500 px-6 py-2 text-white font-medium hover:bg-ember-600">Go to Dashboard</Link>
        ) : (
          <Link to="/login" className="inline-block rounded-lg bg-ember-500 px-6 py-2 text-white font-medium hover:bg-ember-600">Log in</Link>
        )}
      </div>
    </div>
  );
}
