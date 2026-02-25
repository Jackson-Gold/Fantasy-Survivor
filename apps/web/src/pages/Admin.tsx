import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

export default function Admin() {
  const location = useLocation();
  const base = '/admin';
  const nav = [
    { to: base + '/users', label: 'Users' },
    { to: base + '/leagues', label: 'Leagues' },
    { to: base + '/audit', label: 'Audit log' },
  ];

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold text-ocean-900 mb-4">Admin</h1>
      <nav className="flex gap-4 mb-6 border-b border-sand-300 pb-2">
        {nav.map(({ to, label }) => (
          <Link key={to} to={to} className={location.pathname === to ? 'text-ember-600 font-medium' : 'text-ocean-700 hover:underline'}>{label}</Link>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={<p className="text-ocean-600">Choose a section above.</p>} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/leagues" element={<AdminLeagues />} />
        <Route path="/audit" element={<AdminAudit />} />
      </Routes>
    </div>
  );
}

function AdminUsers() {
  const { data } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiGet<{ users: { id: number; username: string; role: string; mustChangePassword: boolean }[] }>('/admin/users'),
  });
  const users = data?.users ?? [];
  return (
    <div>
      <h2 className="text-lg font-semibold text-ocean-800 mb-2">Users</h2>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-4">
            <span>{u.username}</span>
            <span className="text-ocean-600 text-sm">{u.role}</span>
            {u.mustChangePassword && <span className="text-amber-600 text-sm">Must change password</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminLeagues() {
  const { data } = useQuery({
    queryKey: ['admin-leagues'],
    queryFn: () => apiGet<{ leagues: { id: number; name: string; seasonName: string | null }[] }>('/admin/leagues'),
  });
  const leagues = data?.leagues ?? [];
  return (
    <div>
      <h2 className="text-lg font-semibold text-ocean-800 mb-2">Leagues</h2>
      <ul className="space-y-2">
        {leagues.map((l) => (
          <li key={l.id}>
            <Link to={`/admin/leagues/${l.id}`} className="text-ember-600 hover:underline">{l.name}</Link>
            {l.seasonName && <span className="text-ocean-600 ml-2">— {l.seasonName}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminAudit() {
  const { data } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => apiGet<{ auditLog: { id: number; timestamp: string; actionType: string; entityType: string; actorUserId: number | null }[] }>('/admin/audit-log'),
  });
  const log = data?.auditLog ?? [];
  return (
    <div>
      <h2 className="text-lg font-semibold text-ocean-800 mb-2">Audit log</h2>
      <ul className="space-y-1 text-sm">
        {log.slice(0, 50).map((e) => (
          <li key={e.id} className="text-ocean-700">
            {new Date(e.timestamp).toISOString()} | {e.actionType} | {e.entityType} | actor: {e.actorUserId ?? '-'}
          </li>
        ))}
      </ul>
    </div>
  );
}
