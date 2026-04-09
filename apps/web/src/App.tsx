import { useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, ensureApiConfig } from './lib/api';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyTeam from './pages/MyTeam';
import TeamView from './pages/TeamView';
import Picks from './pages/Picks';
import Trades from './pages/Trades';
import Leaderboard from './pages/Leaderboard';
import Versus from './pages/Versus';
import Profile from './pages/Profile';
import Admin from './pages/Admin';

type User = { id: number; username: string; role: string; mustChangePassword: boolean };

function useUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: User }>('/auth/me'),
    retry: false,
  });
}

function Protected({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useUser();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { data } = useUser();
  if (!data?.user || data.user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PicksEpisodeRedirect() {
  const { leagueId } = useParams<{ leagueId: string }>();
  return <Navigate to={leagueId ? `/picks/${leagueId}` : '/dashboard'} replace />;
}

export default function App() {
  useEffect(() => {
    ensureApiConfig();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="team/:leagueId" element={<Protected><MyTeam /></Protected>} />
        <Route path="team/:leagueId/user/:userId" element={<Protected><TeamView /></Protected>} />
        <Route path="picks/:leagueId" element={<Protected><Picks /></Protected>} />
        <Route path="picks/:leagueId/episode/:episodeId" element={<Protected><PicksEpisodeRedirect /></Protected>} />
        <Route path="trades/:leagueId" element={<Protected><Trades /></Protected>} />
        <Route path="leaderboard/:leagueId" element={<Protected><Leaderboard /></Protected>} />
        <Route path="versus/:leagueId" element={<Protected><Versus /></Protected>} />
        <Route path="profile" element={<Protected><Profile /></Protected>} />
        <Route path="admin/*" element={<AdminOnly><Admin /></AdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
