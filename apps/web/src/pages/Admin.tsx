import { useState } from 'react';
import { Routes, Route, Link, useLocation, useParams, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, getApiBaseUrl } from '../lib/api';

export default function Admin() {
  const location = useLocation();
  const base = '/admin';
  const nav = [
    { to: base + '/users', label: 'Users' },
    { to: base + '/leagues', label: 'Leagues' },
    { to: base + '/audit', label: 'Audit log' },
  ];

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { username: string; role: string } }>('/auth/me'),
  });

  const { data: usersData, error: usersError, refetch: refetchAdmin } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiGet<{ users: unknown[] }>('/admin/users'),
    retry: false,
    enabled: !!me?.user && me.user.role === 'admin',
  });

  const needsReauth = usersError instanceof Error && usersError.message.includes('re-authentication');
  const forbidden = me?.user && me.user.role !== 'admin';
  const [password, setPassword] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const verifyAdmin = useMutation({
    mutationFn: (pwd: string) => apiPost<{ ok: boolean }>('/auth/verify-admin', { password: pwd }),
    onSuccess: () => {
      setPassword('');
      setReauthError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      refetchAdmin();
    },
    onError: (err: Error) => setReauthError(err.message),
  });

  if (me && !me.user) return <Navigate to="/login" replace />;
  if (forbidden) {
    return (
      <div className="py-8">
        <h1 className="font-display text-2xl text-ocean-900 mb-4">Admin</h1>
        <p className="text-ember-600">Access denied. Admin only.</p>
      </div>
    );
  }

  if (!!me?.user && me.user.role === 'admin' && needsReauth) {
    return (
      <div className="py-8 max-w-md">
        <h1 className="font-display text-2xl text-ocean-900 mb-4">Admin</h1>
        <p className="text-ocean-700 mb-4">Re-enter your password to continue.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!password.trim()) return;
            verifyAdmin.mutate(password);
          }}
          className="card-tribal p-4 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-ocean-800 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-tribal"
              autoComplete="current-password"
            />
          </div>
          {reauthError && <p className="text-ember-600 text-sm">{reauthError}</p>}
          <button type="submit" className="btn-primary" disabled={verifyAdmin.isPending}>
            {verifyAdmin.isPending ? 'Verifying…' : 'Continue'}
          </button>
        </form>
      </div>
    );
  }

  if (!!me?.user && me.user.role === 'admin' && !usersData && !usersError) {
    return <div className="py-8 text-ocean-600">Loading…</div>;
  }

  return (
    <div className="py-8">
      <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-4">Admin</h1>
      <nav className="flex gap-4 mb-6 border-b border-sand-300 pb-2">
        {nav.map(({ to, label }) => (
          <Link key={to} to={to} className={location.pathname === to ? 'text-ember-600 font-medium' : 'text-ocean-700 hover:underline'}>{label}</Link>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={<p className="text-ocean-600">Choose a section above.</p>} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/leagues" element={<AdminLeagues />} />
        <Route path="/leagues/:id" element={<AdminLeagueDetail />} />
        <Route path="/audit" element={<AdminAudit />} />
      </Routes>
    </div>
  );
}

function AdminUsers() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiGet<{ users: { id: number; username: string; role: string; mustChangePassword: boolean }[] }>('/admin/users'),
  });
  const users = data?.users ?? [];
  const [editingId, setEditingId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { username?: string; role?: string } }) =>
      apiPatch<{ username: string; role: string }>(`/admin/users/${id}`, body),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      apiPost(`/admin/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      setResetId(null);
      setNewPassword('');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return (
    <div>
      <h2 className="text-lg font-semibold text-ocean-800 mb-2">Users</h2>
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-2 rounded-lg bg-sand-50">
            {editingId === u.id ? (
              <>
                <input
                  type="text"
                  defaultValue={u.username}
                  id={`user-username-${u.id}`}
                  className="input-tribal max-w-[160px]"
                />
                <select
                  defaultValue={u.role}
                  id={`user-role-${u.id}`}
                  className="rounded border border-sand-300 px-2 py-1 text-sm"
                >
                  <option value="admin">admin</option>
                  <option value="player">player</option>
                </select>
                <button
                  type="button"
                  className="btn-primary text-sm py-1"
                  onClick={() => {
                    const username = (document.getElementById(`user-username-${u.id}`) as HTMLInputElement)?.value?.trim();
                    const role = (document.getElementById(`user-role-${u.id}`) as HTMLSelectElement)?.value;
                    if (username) patchUser.mutate({ id: u.id, body: { username, role: role as 'admin' | 'player' } });
                  }}
                  disabled={patchUser.isPending}
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-ocean-600 text-sm hover:underline">Cancel</button>
              </>
            ) : (
              <>
                <span className="font-medium">{u.username}</span>
                <span className="text-ocean-600 text-sm">{u.role}</span>
                {u.mustChangePassword && <span className="text-amber-600 text-sm">Must change password</span>}
                <button type="button" onClick={() => setEditingId(u.id)} className="text-sm text-ember-600 hover:underline">Edit</button>
              </>
            )}
            {resetId === u.id ? (
              <span className="flex items-center gap-2 ml-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="input-tribal max-w-[140px] text-sm"
                  minLength={8}
                />
                <button
                  type="button"
                  className="btn-primary text-sm py-1"
                  onClick={() => { if (newPassword.length >= 8) resetPassword.mutate({ id: u.id, password: newPassword }); }}
                  disabled={resetPassword.isPending || newPassword.length < 8}
                >
                  Set
                </button>
                <button type="button" onClick={() => { setResetId(null); setNewPassword(''); }} className="text-ocean-600 text-sm hover:underline">Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setResetId(u.id)} className="text-sm text-ocean-600 hover:underline">Reset password</button>
            )}
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
  const apiBase = getApiBaseUrl() || '';
  const exportUrl = (path: string) => `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const auditExportPath = '/api/v1/admin/export/audit-log';
  const download = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', filename);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const handleExportAudit = (format: 'csv' | 'json') => {
    const url = exportUrl(`${auditExportPath}?format=${format}&limit=2000`);
    fetch(url, { credentials: 'include' })
      .then((r) => (format === 'csv' ? r.text() : r.json()))
      .then((data) => {
        const blob = format === 'csv'
          ? new Blob([data as string], { type: 'text/csv' })
          : new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const u = URL.createObjectURL(blob);
        download(u, format === 'csv' ? 'audit-log.csv' : 'audit-log.json');
        URL.revokeObjectURL(u);
      })
      .catch(() => {});
  };
  return (
    <div>
      <h2 className="text-lg font-semibold text-ocean-800 mb-2">Audit log</h2>
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => handleExportAudit('csv')} className="btn-primary text-sm py-2">
          Export audit log (CSV)
        </button>
        <button type="button" onClick={() => handleExportAudit('json')} className="btn-primary text-sm py-2">
          Export audit log (JSON)
        </button>
      </div>
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

type League = { id: number; name: string; seasonName: string | null; inviteCode: string | null };
type Contestant = { id: number; leagueId: number; name: string; status: string; eliminatedEpisodeId: number | null };
type Episode = { id: number; leagueId: number; episodeNumber: number; title: string | null; airDate: string; lockAt: string };
type ScoringRule = { id: number; leagueId: number; actionType: string; points: number };

function AdminLeagueDetail() {
  const { id } = useParams<{ id: string }>();
  const leagueId = parseInt(id ?? '0', 10);
  const qc = useQueryClient();

  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ['admin-league', leagueId],
    queryFn: () => apiGet<League>(`/admin/leagues/${leagueId}`),
    enabled: leagueId > 0,
  });

  const { data: contestantsData } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'contestants'],
    queryFn: () => apiGet<{ contestants: Contestant[] }>(`/admin/leagues/${leagueId}/contestants`),
    enabled: leagueId > 0,
  });

  const { data: episodesData } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'episodes'],
    queryFn: () => apiGet<{ episodes: Episode[] }>(`/admin/leagues/${leagueId}/episodes`),
    enabled: leagueId > 0,
  });

  const { data: rulesData } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'scoring-rules'],
    queryFn: () => apiGet<{ scoringRules: ScoringRule[] }>(`/admin/leagues/${leagueId}/scoring-rules`),
    enabled: leagueId > 0,
  });

  const patchLeague = useMutation({
    mutationFn: (body: { name?: string; seasonName?: string; regenerateInviteCode?: boolean }) =>
      apiPatch<League>(`/admin/leagues/${leagueId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-league', leagueId] });
      qc.invalidateQueries({ queryKey: ['admin-leagues'] });
    },
  });

  if (!id || leagueId <= 0) return <div className="py-8">Invalid league.</div>;
  if (leagueLoading || !league) return <div className="py-8">Loading…</div>;

  const contestants = contestantsData?.contestants ?? [];
  const episodes = episodesData?.episodes ?? [];
  const scoringRules = rulesData?.scoringRules ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/admin/leagues" className="text-ocean-600 hover:underline">← Leagues</Link>
      </div>
      <div className="card-tribal p-4">
        <h2 className="font-display text-xl text-ocean-900 mb-4">League: {league.name}</h2>
        <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-ocean-800 mb-1">Name</label>
            <input
              type="text"
              defaultValue={league.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== league.name) patchLeague.mutate({ name: v }); }}
              className="input-tribal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ocean-800 mb-1">Season name</label>
            <input
              type="text"
              defaultValue={league.seasonName ?? ''}
              onBlur={(e) => { const v = e.target.value.trim() || undefined; if (v !== (league.seasonName ?? '')) patchLeague.mutate({ seasonName: v || undefined }); }}
              className="input-tribal"
              placeholder="Season 1"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-sm font-medium text-ocean-800">Invite code:</label>
            <code className="bg-sand-100 px-2 py-1 rounded">{league.inviteCode ?? '—'}</code>
            <button
              type="button"
              onClick={() => patchLeague.mutate({ regenerateInviteCode: true })}
              className="text-sm text-ember-600 hover:underline"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      <AdminLeagueContestants leagueId={leagueId} contestants={contestants} />
      <AdminLeagueEpisodes leagueId={leagueId} episodes={episodes} />
      <AdminLeagueOutcomes leagueId={leagueId} episodes={episodes} contestants={contestants} />
      <AdminLeagueWinnerPicks leagueId={leagueId} contestants={contestants} />
      <AdminLeagueVotePredictions leagueId={leagueId} episodes={episodes} contestants={contestants} />
      <AdminLeagueRosters leagueId={leagueId} contestants={contestants} />
      <AdminLeagueTrades leagueId={leagueId} />
      <AdminLeagueScoringRules leagueId={leagueId} scoringRules={scoringRules} />
      <AdminLeagueExport leagueId={leagueId} />
    </div>
  );
}

function AdminLeagueContestants({ leagueId, contestants }: { leagueId: number; contestants: Contestant[] }) {
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const addContestant = useMutation({
    mutationFn: (n: string) => apiPost<Contestant>(`/admin/leagues/${leagueId}/contestants`, { name: n }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'contestants'] });
    },
  });
  const patchContestant = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { status?: string; eliminatedEpisodeId?: number | null } }) =>
      apiPatch(`/admin/contestants/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'contestants'] }),
  });
  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Contestants</h3>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) addContestant.mutate(name.trim()); }}
        className="flex gap-2 mb-4"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contestant name"
          className="input-tribal flex-1 max-w-xs"
        />
        <button type="submit" className="btn-primary" disabled={addContestant.isPending}>Add</button>
      </form>
      <ul className="space-y-2">
        {contestants.map((c) => (
          <li key={c.id} className="flex items-center gap-4 flex-wrap">
            <span className="font-medium">{c.name}</span>
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                c.status === 'active' ? 'bg-jungle-100 text-jungle-800' : c.status === 'eliminated' ? 'bg-ember-100 text-ember-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {c.status}
            </span>
            <select
              value={c.status}
              onChange={(e) => patchContestant.mutate({ id: c.id, body: { status: e.target.value } })}
              className="rounded border border-sand-300 px-2 py-1 text-sm"
            >
              <option value="active">Active</option>
              <option value="eliminated">Eliminated</option>
              <option value="injured">Injured</option>
            </select>
            {c.status === 'eliminated' && (
              <span className="text-ocean-600 text-sm">Ep. {c.eliminatedEpisodeId ?? '—'}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminLeagueEpisodes({ leagueId, episodes }: { leagueId: number; episodes: Episode[] }) {
  const [epNum, setEpNum] = useState('');
  const [title, setTitle] = useState('');
  const [airDate, setAirDate] = useState('');
  const qc = useQueryClient();
  const createEpisode = useMutation({
    mutationFn: (body: { episodeNumber: number; title?: string; airDate: string }) =>
      apiPost<Episode>(`/admin/leagues/${leagueId}/episodes`, body),
    onSuccess: () => {
      setEpNum('');
      setTitle('');
      setAirDate('');
      qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'episodes'] });
    },
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(epNum, 10);
    if (Number.isNaN(num) || num < 1 || !airDate.trim()) return;
    createEpisode.mutate({ episodeNumber: num, title: title.trim() || undefined, airDate: airDate.trim() });
  };
  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Episodes</h3>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 mb-4">
        <input
          type="number"
          min={1}
          value={epNum}
          onChange={(e) => setEpNum(e.target.value)}
          placeholder="Episode #"
          className="input-tribal w-24"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="input-tribal flex-1 min-w-[120px]"
        />
        <input
          type="datetime-local"
          value={airDate}
          onChange={(e) => setAirDate(e.target.value)}
          className="input-tribal"
        />
        <button type="submit" className="btn-primary" disabled={createEpisode.isPending}>Create episode</button>
      </form>
      <ul className="space-y-1 text-sm">
        {episodes.map((ep) => (
          <li key={ep.id} className="text-ocean-700">
            Ep {ep.episodeNumber} {ep.title ? `— ${ep.title}` : ''} · Lock: {new Date(ep.lockAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminLeagueOutcomes({
  leagueId,
  episodes,
  contestants,
}: {
  leagueId: number;
  episodes: Episode[];
  contestants: Contestant[];
}) {
  const [episodeId, setEpisodeId] = useState<number | ''>('');
  const [individualImmunityId, setIndividualImmunityId] = useState<number | ''>('');
  const [idolFoundId, setIdolFoundId] = useState<number | ''>('');
  const [idolPlayedId, setIdolPlayedId] = useState<number | ''>('');
  const [votedOutIds, setVotedOutIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const qc = useQueryClient();

  const toggleVotedOut = (id: number) => {
    setVotedOutIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const epId = episodeId === '' ? 0 : Number(episodeId);
    if (!epId) {
      setMessage('Select an episode.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      if (individualImmunityId) {
        await apiPost('/admin/scoring-events', {
          leagueId,
          episodeId: epId,
          actionType: 'individual_immunity',
          contestantId: Number(individualImmunityId),
        });
      }
      if (idolFoundId) {
        await apiPost('/admin/scoring-events', {
          leagueId,
          episodeId: epId,
          actionType: 'idol_found',
          contestantId: Number(idolFoundId),
        });
      }
      if (idolPlayedId) {
        await apiPost('/admin/scoring-events', {
          leagueId,
          episodeId: epId,
          actionType: 'idol_played',
          contestantId: Number(idolPlayedId),
        });
      }
      for (const cId of votedOutIds) {
        await apiPost('/admin/scoring-events', {
          leagueId,
          episodeId: epId,
          actionType: 'eliminated',
          contestantId: cId,
        });
      }
      if (votedOutIds.length > 0) {
        await apiPost(`/admin/leagues/${leagueId}/episodes/${epId}/apply-vote-points`, {
          votedOutContestantIds: votedOutIds,
        });
      }
      setMessage('Outcomes submitted.');
      setIndividualImmunityId('');
      setIdolFoundId('');
      setIdolPlayedId('');
      setVotedOutIds([]);
      qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId] });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Enter outcomes</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Episode</label>
          <select
            value={episodeId}
            onChange={(e) => setEpisodeId(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-tribal max-w-xs"
          >
            <option value="">—</option>
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                Ep {ep.episodeNumber} {ep.title ? `— ${ep.title}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Individual immunity</label>
          <select
            value={individualImmunityId}
            onChange={(e) => setIndividualImmunityId(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-tribal max-w-xs"
          >
            <option value="">—</option>
            {contestants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Idol found</label>
          <select
            value={idolFoundId}
            onChange={(e) => setIdolFoundId(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-tribal max-w-xs"
          >
            <option value="">—</option>
            {contestants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Idol played</label>
          <select
            value={idolPlayedId}
            onChange={(e) => setIdolPlayedId(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-tribal max-w-xs"
          >
            <option value="">—</option>
            {contestants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ocean-800 mb-1">Voted out</label>
          <div className="flex flex-wrap gap-2">
            {contestants.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={votedOutIds.includes(c.id)}
                  onChange={() => toggleVotedOut(c.id)}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </div>
        {message && <p className={`text-sm ${message.startsWith('Outcomes') ? 'text-jungle-700' : 'text-ember-600'}`}>{message}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit outcomes'}
        </button>
      </form>
    </div>
  );
}

// ---------- Winner picks (admin) ----------
type WinnerPickRow = { userId: number; username: string; pick: { contestantId: number; name: string } | null };
function AdminLeagueWinnerPicks({ leagueId, contestants }: { leagueId: number; contestants: Contestant[] }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'winner-picks'],
    queryFn: () => apiGet<{ winnerPicks: WinnerPickRow[] }>(`/admin/leagues/${leagueId}/winner-picks`),
    enabled: leagueId > 0,
  });
  const [userId, setUserId] = useState<number | ''>('');
  const [contestantId, setContestantId] = useState<number | ''>('');

  const putWinnerPick = useMutation({
    mutationFn: (body: { userId: number; contestantId: number }) =>
      apiPut(`/admin/leagues/${leagueId}/winner-picks`, body),
    onSuccess: () => {
      setUserId('');
      setContestantId('');
      qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'winner-picks'] });
    },
  });

  const list = data?.winnerPicks ?? [];
  const memberOptions = list.map((r) => ({ id: r.userId, name: r.username }));

  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Winner picks</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b border-sand-300">
            <th className="text-left py-2">User</th>
            <th className="text-left py-2">Current pick</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.userId} className="border-b border-sand-200">
              <td className="py-2">{row.username}</td>
              <td className="py-2">{row.pick ? row.pick.name : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="flex flex-wrap gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (userId !== '' && contestantId !== '') putWinnerPick.mutate({ userId, contestantId });
        }}
      >
        <div>
          <label className="block text-xs font-medium text-ocean-700 mb-1">User</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-tribal min-w-[120px]"
          >
            <option value="">—</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ocean-700 mb-1">Contestant</label>
          <select
            value={contestantId}
            onChange={(e) => setContestantId(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-tribal min-w-[140px]"
          >
            <option value="">—</option>
            {contestants.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={putWinnerPick.isPending || userId === '' || contestantId === ''}>
          Set pick
        </button>
      </form>
    </div>
  );
}

// ---------- Vote predictions (admin) ----------
const defaultVoteTotal = 10;
function AdminLeagueVotePredictions({
  leagueId,
  episodes,
  contestants,
}: {
  leagueId: number;
  episodes: Episode[];
  contestants: Contestant[];
}) {
  const qc = useQueryClient();
  const [episodeId, setEpisodeId] = useState<number | ''>('');
  const { data: votesData } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'votes', episodeId],
    queryFn: () => apiGet<{ votesByUser: { userId: number; username: string; allocations: { contestantId: number; name: string; votes: number }[] }[] }>(
      `/admin/leagues/${leagueId}/episodes/${episodeId}/votes`
    ),
    enabled: leagueId > 0 && episodeId !== '',
  });
  const [editUserId, setEditUserId] = useState<number | ''>('');
  const [allocations, setAllocations] = useState<{ contestantId: number; votes: number }[]>([]);

  const putVotes = useMutation({
    mutationFn: (body: { userId: number; allocations: { contestantId: number; votes: number }[] }) =>
      apiPut(`/admin/leagues/${leagueId}/episodes/${Number(episodeId)}/votes`, body),
    onSuccess: () => {
      setEditUserId('');
      qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'votes', episodeId] });
    },
  });

  const votesByUser = votesData?.votesByUser ?? [];
  const startEdit = (userId: number) => {
    const userRow = votesByUser.find((u) => u.userId === userId);
    const allocs = userRow?.allocations?.map((a) => ({ contestantId: a.contestantId, votes: a.votes })) ?? [];
    setEditUserId(userId);
    if (allocs.length > 0) setAllocations(allocs);
    else setAllocations(contestants.slice(0, 3).map((c) => ({ contestantId: c.id, votes: 0 })));
  };
  const setAlloc = (contestantId: number, votes: number) => {
    setAllocations((prev) => {
      const next = prev.filter((a) => a.contestantId !== contestantId);
      if (votes > 0) next.push({ contestantId, votes });
      return next;
    });
  };
  const total = allocations.reduce((s, a) => s + a.votes, 0);

  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Vote predictions</h3>
      <div className="mb-3">
        <label className="block text-sm font-medium text-ocean-700 mb-1">Episode</label>
        <select
          value={episodeId}
          onChange={(e) => { setEpisodeId(e.target.value === '' ? '' : Number(e.target.value)); setEditUserId(''); }}
          className="input-tribal max-w-xs"
        >
          <option value="">—</option>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>Ep {ep.episodeNumber} {ep.title ? `— ${ep.title}` : ''}</option>
          ))}
        </select>
      </div>
      {episodeId !== '' && (
        <>
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="border-b border-sand-300">
                <th className="text-left py-2">User</th>
                <th className="text-left py-2">Allocations</th>
                <th className="text-left py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {votesByUser.map((row) => (
                <tr key={row.userId} className="border-b border-sand-200">
                  <td className="py-2">{row.username}</td>
                  <td className="py-2">{row.allocations.map((a) => `${a.name}: ${a.votes}`).join(', ') || '—'}</td>
                  <td className="py-2">
                    <button type="button" onClick={() => startEdit(row.userId)} className="text-ember-600 text-sm hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editUserId !== '' && (
            <div className="border border-sand-300 rounded-lg p-3 mb-4 bg-sand-50">
              <p className="text-sm font-medium text-ocean-800 mb-2">Edit allocations (total must be {defaultVoteTotal})</p>
              <div className="flex flex-wrap gap-4 mb-2">
                {contestants.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1">
                    <span className="w-24 truncate">{c.name}</span>
                    <input
                      type="number"
                      min={0}
                      value={allocations.find((a) => a.contestantId === c.id)?.votes ?? 0}
                      onChange={(e) => setAlloc(c.id, parseInt(e.target.value, 10) || 0)}
                      className="input-tribal w-14"
                    />
                  </label>
                ))}
              </div>
              <p className={`text-sm mb-2 ${total === defaultVoteTotal ? 'text-jungle-700' : 'text-ember-600'}`}>Total: {total}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={total !== defaultVoteTotal || putVotes.isPending}
                  onClick={() => putVotes.mutate({ userId: editUserId, allocations })}
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditUserId('')} className="text-ocean-600 text-sm hover:underline">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Rosters (admin) ----------
type TeamRow = { userId: number; username: string; roster: { contestantId: number; name: string }[] };
function AdminLeagueRosters({ leagueId, contestants }: { leagueId: number; contestants: Contestant[] }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'teams'],
    queryFn: () => apiGet<{ teams: TeamRow[] }>(`/admin/leagues/${leagueId}/teams`),
    enabled: leagueId > 0,
  });
  const [addUserId, setAddUserId] = useState<number | ''>('');
  const [addContestantId, setAddContestantId] = useState<number | ''>('');

  const addContestant = useMutation({
    mutationFn: (body: { userId: number; contestantId: number }) =>
      apiPost(`/admin/leagues/${leagueId}/teams/${body.userId}/add`, { contestantId: body.contestantId }),
    onSuccess: () => {
      setAddUserId('');
      setAddContestantId('');
      qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'teams'] });
    },
  });
  const removeContestant = useMutation({
    mutationFn: ({ userId, contestantId }: { userId: number; contestantId: number }) =>
      apiDelete(`/admin/leagues/${leagueId}/teams/${userId}/contestants/${contestantId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'teams'] }),
  });

  const teamsList = data?.teams ?? [];
  const rosterContestantIds = new Set(teamsList.flatMap((t) => t.roster.map((r) => r.contestantId)));
  const availableContestants = contestants.filter((c) => !rosterContestantIds.has(c.id));

  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Rosters</h3>
      <ul className="space-y-4 mb-4">
        {teamsList.map((t) => (
          <li key={t.userId} className="border border-sand-200 rounded-lg p-3">
            <span className="font-medium text-ocean-800">{t.username}</span>
            <ul className="flex flex-wrap gap-2 mt-2">
              {t.roster.map((r) => (
                <li key={r.contestantId} className="flex items-center gap-1 bg-sand-100 px-2 py-1 rounded text-sm">
                  {r.name}
                  <button
                    type="button"
                    onClick={() => removeContestant.mutate({ userId: t.userId, contestantId: r.contestantId })}
                    className="text-ember-600 hover:underline text-xs"
                    disabled={removeContestant.isPending || t.roster.length <= 2}
                    title={t.roster.length <= 2 ? 'Min 2 contestants' : 'Remove'}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-2 items-center">
              <select
                value={addUserId === t.userId ? addContestantId : ''}
                onChange={(e) => { setAddUserId(t.userId); setAddContestantId(e.target.value === '' ? '' : Number(e.target.value)); }}
                className="input-tribal text-sm max-w-[140px]"
              >
                <option value="">Add contestant…</option>
                {availableContestants.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {addUserId === t.userId && addContestantId !== '' && (
                <button
                  type="button"
                  className="btn-primary text-sm py-1"
                  disabled={addContestant.isPending || t.roster.length >= 3}
                  onClick={() => { addContestant.mutate({ userId: t.userId, contestantId: addContestantId }); setAddUserId(''); setAddContestantId(''); }}
                >
                  Add
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Trades (admin) ----------
type TradeItem = { id: number; tradeId: number; side: string; type: string; contestantId: number | null; points: number | null };
type TradeRow = { id: number; leagueId: number; proposerId: number; acceptorId: number; status: string; items: TradeItem[] };
function AdminLeagueTrades({ leagueId }: { leagueId: number }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin-leagues', leagueId, 'trades'],
    queryFn: () => apiGet<{ trades: TradeRow[] }>(`/admin/leagues/${leagueId}/trades`),
    enabled: leagueId > 0,
  });
  const patchTrade = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiPatch(`/admin/trades/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'trades'] }),
  });

  const tradesList = data?.trades ?? [];
  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Trades</h3>
      {tradesList.length === 0 ? (
        <p className="text-ocean-600 text-sm">No trades.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-sand-300">
              <th className="text-left py-2">ID</th>
              <th className="text-left py-2">Proposer / Acceptor</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Items</th>
              <th className="text-left py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {tradesList.map((t) => (
              <tr key={t.id} className="border-b border-sand-200">
                <td className="py-2">{t.id}</td>
                <td className="py-2">{t.proposerId} / {t.acceptorId}</td>
                <td className="py-2">{t.status}</td>
                <td className="py-2">{t.items.map((i) => `${i.side}: ${i.type}${i.contestantId ?? ''}${i.points ?? ''}`).join(', ')}</td>
                <td className="py-2">
                  {(t.status === 'proposed' || t.status === 'pending') && (
                    <button
                      type="button"
                      onClick={() => patchTrade.mutate({ id: t.id, status: 'canceled' })}
                      className="text-ember-600 text-sm hover:underline"
                      disabled={patchTrade.isPending}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AdminLeagueExport({ leagueId }: { leagueId: number }) {
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const apiBase = getApiBaseUrl() || '';
  const exportUrl = (path: string) => `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const download = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', filename);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const handleExportLedger = (format: 'csv' | 'json') => {
    const path = `/api/v1/admin/export/ledger?leagueId=${leagueId}&format=${format}`;
    fetch(exportUrl(path), { credentials: 'include' })
      .then((r) => (format === 'csv' ? r.text() : r.json()))
      .then((data) => {
        const blob = format === 'csv'
          ? new Blob([data as string], { type: 'text/csv' })
          : new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const u = URL.createObjectURL(blob);
        download(u, format === 'csv' ? `ledger-${leagueId}.csv` : `ledger-${leagueId}.json`);
        URL.revokeObjectURL(u);
      })
      .catch(() => {});
  };
  const recompute = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message?: string }>(`/admin/leagues/${leagueId}/recompute-leaderboard`, {}),
    onSuccess: (data) => {
      setRecomputeMsg(data.message ?? 'Done.');
      qc.invalidateQueries({ queryKey: ['leaderboard', leagueId] });
    },
    onError: (err: Error) => setRecomputeMsg(err.message),
  });
  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Export & tools</h3>
      <div className="flex flex-wrap gap-2 mb-2">
        <button type="button" onClick={() => handleExportLedger('csv')} className="btn-primary text-sm py-2">
          Export ledger (CSV)
        </button>
        <button type="button" onClick={() => handleExportLedger('json')} className="btn-primary text-sm py-2">
          Export ledger (JSON)
        </button>
        <button
          type="button"
          onClick={() => recompute.mutate()}
          className="rounded-xl border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-ocean-800 hover:bg-sand-50"
          disabled={recompute.isPending}
        >
          {recompute.isPending ? '…' : 'Recompute leaderboard'}
        </button>
      </div>
      {recomputeMsg && <p className="text-sm text-ocean-600">{recomputeMsg}</p>}
    </div>
  );
}

function AdminLeagueScoringRules({ leagueId, scoringRules }: { leagueId: number; scoringRules: ScoringRule[] }) {
  const qc = useQueryClient();
  const putRule = useMutation({
    mutationFn: ({ id, points }: { id: number; points: number }) => apiPut(`/admin/scoring-rules/${id}`, { points }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'scoring-rules'] }),
  });
  const resetDefaults = useMutation({
    mutationFn: () => apiPost(`/admin/leagues/${leagueId}/scoring-rules/defaults`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-leagues', leagueId, 'scoring-rules'] }),
  });
  return (
    <div className="card-tribal p-4">
      <h3 className="font-semibold text-ocean-800 mb-3">Scoring rules</h3>
      <button
        type="button"
        onClick={() => resetDefaults.mutate()}
        className="text-sm text-ember-600 hover:underline mb-3"
      >
        Reset to defaults
      </button>
      <ul className="space-y-2">
        {scoringRules.map((r) => (
          <li key={r.id} className="flex items-center gap-4">
            <span className="text-ocean-800">{r.actionType}</span>
            <input
              type="number"
              defaultValue={r.points}
              onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v) && v !== r.points) putRule.mutate({ id: r.id, points: v }); }}
              className="input-tribal w-20"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
