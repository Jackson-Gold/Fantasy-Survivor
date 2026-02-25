import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ocean-900 text-white shadow">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-xl font-bold text-ember-500">Fantasy Survivor</Link>
          <nav className="hidden md:flex gap-6">
            {user && <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'text-ember-400' : 'hover:text-ember-400'}>Dashboard</Link>}
            {user && <Link to="/profile" className={location.pathname === '/profile' ? 'text-ember-400' : 'hover:text-ember-400'}>Profile</Link>}
            {isAdmin && <Link to="/admin" className="text-amber-300 hover:text-amber-200">Admin</Link>}
            {user ? (
              <button
                onClick={async () => {
                  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
                  await fetch(base ? `${base}/api/v1/auth/logout` : '/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
                  qc.clear();
                  window.location.href = '/';
                }}
                className="hover:text-ember-400"
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className="hover:text-ember-400">Login</Link>
            )}
          </nav>
        </div>
        {/* Mobile bottom nav */}
        {user && (
          <nav className="fixed bottom-0 left-0 right-0 flex justify-around bg-ocean-900 text-white py-2 md:hidden z-50">
            <Link to="/dashboard" className="p-2">Dashboard</Link>
            <Link to="/profile" className="p-2">Profile</Link>
          </nav>
        )}
      </header>
      <main className={`flex-1 mx-auto w-full max-w-6xl px-4 ${user ? 'pb-16 md:pb-4' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
