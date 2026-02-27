import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';

type User = { id: number; username: string; role: string };

export default function Layout() {
  const location = useLocation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: User }>('/auth/me'),
    retry: false,
  });
  const user = data?.user;
  const isAdmin = user?.role === 'admin';
  const { league: currentLeague } = useCurrentLeague();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ocean-900 text-white shadow-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-display text-2xl tracking-wide text-ember-400 hover:text-ember-300 transition-colors">
            FANTASY SURVIVOR
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {user && (
              <>
                <Link
                  to="/dashboard"
                  className={`font-medium transition-colors ${location.pathname === '/dashboard' ? 'text-ember-400' : 'text-white/90 hover:text-ember-300'}`}
                >
                  Dashboard
                </Link>
                {currentLeague && (
                  <>
                    <Link
                      to={`/team/${currentLeague.id}`}
                      className={`font-medium transition-colors ${location.pathname.startsWith('/team/') ? 'text-ember-400' : 'text-white/90 hover:text-ember-300'}`}
                    >
                      My Team
                    </Link>
                    <Link
                      to={`/picks/${currentLeague.id}`}
                      className={`font-medium transition-colors ${location.pathname.startsWith('/picks/') ? 'text-ember-400' : 'text-white/90 hover:text-ember-300'}`}
                    >
                      Picks
                    </Link>
                    <Link
                      to={`/trades/${currentLeague.id}`}
                      className={`font-medium transition-colors ${location.pathname.startsWith('/trades/') ? 'text-ember-400' : 'text-white/90 hover:text-ember-300'}`}
                    >
                      Trades
                    </Link>
                    <Link
                      to={`/leaderboard/${currentLeague.id}`}
                      className={`font-medium transition-colors ${location.pathname.startsWith('/leaderboard/') ? 'text-ember-400' : 'text-white/90 hover:text-ember-300'}`}
                    >
                      Leaderboard
                    </Link>
                  </>
                )}
                <Link
                  to="/profile"
                  className={`font-medium transition-colors ${location.pathname === '/profile' ? 'text-ember-400' : 'text-white/90 hover:text-ember-300'}`}
                >
                  Profile
                </Link>
              </>
            )}
            {isAdmin && (
              <Link to="/admin" className="font-medium text-amber-300 hover:text-amber-200 transition-colors">
                Admin
              </Link>
            )}
            {user ? (
              <button
                onClick={async () => {
                  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
                  await fetch(base ? `${base}/api/v1/auth/logout` : '/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
                  qc.clear();
                  window.location.href = '/';
                }}
                className="font-medium text-white/90 hover:text-ember-300 transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="font-medium text-ember-400 hover:text-ember-300 transition-colors">
                Login
              </Link>
            )}
          </nav>
        </div>
        {user && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around bg-ocean-900 text-white py-3 z-50 border-t border-ocean-800">
            <Link to="/dashboard" className="px-2 py-2 font-medium text-xs">Dashboard</Link>
            {currentLeague && (
              <>
                <Link to={`/team/${currentLeague.id}`} className="px-2 py-2 font-medium text-xs">Team</Link>
                <Link to={`/picks/${currentLeague.id}`} className="px-2 py-2 font-medium text-xs">Picks</Link>
                <Link to={`/trades/${currentLeague.id}`} className="px-2 py-2 font-medium text-xs">Trades</Link>
                <Link to={`/leaderboard/${currentLeague.id}`} className="px-2 py-2 font-medium text-xs">Board</Link>
              </>
            )}
            <Link to="/profile" className="px-2 py-2 font-medium text-xs">Profile</Link>
            {isAdmin && <Link to="/admin" className="px-2 py-2 font-medium text-xs text-amber-300">Admin</Link>}
          </nav>
        )}
      </header>
      <main className={`flex-1 mx-auto w-full max-w-6xl px-4 ${user ? 'pb-20 md:pb-8' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
