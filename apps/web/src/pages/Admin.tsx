import { useState } from 'react';
import { Routes, Route, Link, useLocation, useParams, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiPut, getApiBaseUrl } from '../lib/api';

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
