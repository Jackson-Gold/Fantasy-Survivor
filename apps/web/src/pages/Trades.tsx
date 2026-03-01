import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';

type TradeItem = { side: string; type: string; contestantId?: number; points?: number; contestantName?: string | null };
type Trade = {
  id: number;
  proposerId: number;
  acceptorId: number;
  status: string;
  note: string | null;
  proposerUsername?: string;
  acceptorUsername?: string;
  items: TradeItem[];
};

type LeagueMember = { id: number; username: string };
type RosterItem = { id: number; contestantId: number; name: string };

export default function Trades() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();
  const [showPropose, setShowPropose] = useState(false);
  const [acceptorId, setAcceptorId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [proposeItems, setProposeItems] = useState<{ side: 'from_proposer' | 'from_acceptor'; type: 'contestant' | 'points'; contestantId?: number; points?: number }[]>([]);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => apiGet<{ user: { id: number } }>('/auth/me') });
  const myId = me?.user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['trades', id],
    queryFn: () => apiGet<{ trades: Trade[] }>(`/trades/${id}`),
    enabled: id > 0,
  });

  const { data: membersData } = useQuery({
    queryKey: ['leagues', id, 'members'],
    queryFn: () => apiGet<{ members: LeagueMember[] }>(`/leagues/${id}/members`),
    enabled: id > 0,
  });

  const { data: myRosterData } = useQuery({
    queryKey: ['team', id],
    queryFn: () => apiGet<{ roster: RosterItem[] }>(`/teams/${id}`),
    enabled: id > 0,
  });

  const { data: theirRosterData } = useQuery({
    queryKey: ['team', id, 'roster', acceptorId],
    queryFn: () => apiGet<{ roster: RosterItem[] }>(`/teams/${id}/roster/${acceptorId}`),
    enabled: id > 0 && acceptorId !== '' && acceptorId !== myId,
  });

  const acceptMut = useMutation({
    mutationFn: (tradeId: number) => apiPost(`/trades/${tradeId}/accept`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', id] }),
  });

  const rejectMut = useMutation({
    mutationFn: (tradeId: number) => apiPost(`/trades/${tradeId}/reject`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', id] }),
  });

  const proposeMut = useMutation({
    mutationFn: (body: { leagueId: number; acceptorId: number; note?: string; items: { side: string; type: string; contestantId?: number; points?: number }[] }) =>
      apiPost('/trades/propose', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', id] });
      setShowPropose(false);
      setAcceptorId('');
      setNote('');
      setProposeItems([]);
    },
  });

  const members = membersData?.members ?? [];
  const myRoster = myRosterData?.roster ?? [];
  const theirRoster = theirRosterData?.roster ?? [];
  const otherMembers = members.filter((m) => m.id !== myId);

  const addProposeItem = (side: 'from_proposer' | 'from_acceptor', type: 'contestant' | 'points' = 'contestant') => {
    const roster = side === 'from_proposer' ? myRoster : theirRoster;
    if (type === 'contestant') {
      setProposeItems((prev) => [...prev, { side, type: 'contestant', contestantId: roster[0]?.contestantId }]);
    } else {
      setProposeItems((prev) => [...prev, { side, type: 'points', points: 0 }]);
    }
  };

  const updateProposeItem = (index: number, updates: Partial<{ side: 'from_proposer' | 'from_acceptor'; type: 'contestant' | 'points'; contestantId: number; points: number }>) => {
    setProposeItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const removeProposeItem = (index: number) => setProposeItems((prev) => prev.filter((_, i) => i !== index));

  const handlePropose = (e: React.FormEvent) => {
    e.preventDefault();
    if (acceptorId === '' || proposeItems.length === 0) return;
    proposeMut.mutate({
      leagueId: id,
      acceptorId: Number(acceptorId),
      note: note.trim() || undefined,
      items: proposeItems.map((it) => ({
        side: it.side,
        type: it.type,
        contestantId: it.type === 'contestant' ? it.contestantId : undefined,
        points: it.type === 'points' ? it.points : undefined,
      })),
    });
  };

  function itemLabel(it: TradeItem): string {
    if (it.type === 'contestant') return it.contestantName ?? `Contestant #${it.contestantId}`;
    return `Points: ${it.points ?? 0}`;
  }

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && id !== currentLeague.id) return <Navigate to={`/trades/${currentLeague.id}`} replace />;
  if (isLoading) return <div className="py-8">Loading…</div>;

  const tradesList = data?.trades ?? [];

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-ocean-900">Trades</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>
      <p className="text-ocean-600 text-sm mb-4">Propose and accept trades. Trades lock with the weekly deadline.</p>

      <div className="card-tribal p-4 mb-6">
        <button
          type="button"
          onClick={() => setShowPropose((v) => !v)}
          className="font-medium text-ocean-800 hover:text-ember-600"
        >
          {showPropose ? '− Cancel' : '+ Propose a trade'}
        </button>
        {showPropose && (
          <form onSubmit={handlePropose} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ocean-800 mb-1">Trade with</label>
              <select
                value={acceptorId}
                onChange={(e) => setAcceptorId(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-tribal max-w-xs"
              >
                <option value="">Select player…</option>
                {otherMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.username}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ocean-800 mb-1">Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="input-tribal w-full max-w-md" placeholder="e.g. Swap for next week" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ocean-800 mb-2">Items (at least one)</label>
              {proposeItems.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
                  <select
                    value={it.side}
                    onChange={(e) => updateProposeItem(i, { side: e.target.value as 'from_proposer' | 'from_acceptor' })}
                    className="input-tribal w-32"
                  >
                    <option value="from_proposer">From me</option>
                    <option value="from_acceptor">From them</option>
                  </select>
                  <select
                    value={it.type}
                    onChange={(e) => updateProposeItem(i, { type: e.target.value as 'contestant' | 'points' })}
                    className="input-tribal w-28"
                  >
                    <option value="contestant">Contestant</option>
                    <option value="points">Points</option>
                  </select>
                  {it.type === 'contestant' ? (
                    <select
                      value={it.contestantId ?? ''}
                      onChange={(e) => updateProposeItem(i, { contestantId: Number(e.target.value) })}
                      className="input-tribal min-w-[120px]"
                    >
                      {(it.side === 'from_proposer' ? myRoster : theirRoster).map((r) => (
                        <option key={r.id} value={r.contestantId}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      value={it.points ?? 0}
                      onChange={(e) => updateProposeItem(i, { points: parseInt(e.target.value, 10) || 0 })}
                      className="input-tribal w-20"
                    />
                  )}
                  <button type="button" onClick={() => removeProposeItem(i)} className="text-red-600 text-sm hover:underline">Remove</button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => addProposeItem('from_proposer', 'contestant')} className="text-sm text-ember-600 hover:underline">+ From me (contestant)</button>
                <button type="button" onClick={() => addProposeItem('from_acceptor', 'contestant')} className="text-sm text-ember-600 hover:underline">+ From them (contestant)</button>
                <button type="button" onClick={() => addProposeItem('from_proposer', 'points')} className="text-sm text-ember-600 hover:underline">+ From me (points)</button>
                <button type="button" onClick={() => addProposeItem('from_acceptor', 'points')} className="text-sm text-ember-600 hover:underline">+ From them (points)</button>
              </div>
            </div>
            {proposeMut.isError && <p className="text-red-600 text-sm">{(proposeMut.error as Error).message}</p>}
            <button type="submit" className="btn-primary" disabled={proposeMut.isPending || proposeItems.length === 0 || acceptorId === ''}>
              {proposeMut.isPending ? 'Submitting…' : 'Propose trade'}
            </button>
          </form>
        )}
      </div>

      <ul className="space-y-4">
        {tradesList.map((t) => (
          <li key={t.id} className="rounded-xl border border-sand-300 bg-sand-50 p-4">
            <p className="font-medium text-ocean-900">
              {t.proposerUsername ?? 'Proposer'} → {t.acceptorUsername ?? 'Acceptor'}
            </p>
            <p className="text-sm text-ocean-600 mt-0.5">Status: {t.status}</p>
            {t.note && <p className="text-ocean-700 mt-1 text-sm">{t.note}</p>}
            <ul className="mt-2 text-sm text-ocean-800">
              {t.items.map((it, i) => (
                <li key={i}>{it.side === 'from_proposer' ? 'From proposer' : 'From acceptor'}: {itemLabel(it)}</li>
              ))}
            </ul>
            {t.status === 'proposed' && t.acceptorId === myId && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => acceptMut.mutate(t.id)} className="rounded bg-ember-500 px-3 py-1 text-white text-sm">Accept</button>
                <button onClick={() => rejectMut.mutate(t.id)} className="rounded bg-sand-300 px-3 py-1 text-ocean-800 text-sm">Reject</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {tradesList.length === 0 && !showPropose && <p className="text-ocean-600">No trades yet. Use &quot;Propose a trade&quot; to get started.</p>}
    </div>
  );
}
