import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';

type Trade = {
  id: number;
  proposerId: number;
  acceptorId: number;
  status: string;
  note: string | null;
  items: { side: string; type: string; contestantId?: number; points?: number }[];
};

export default function Trades() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);

  const { data, isLoading } = useQuery({
    queryKey: ['trades', id],
    queryFn: () => apiGet<{ trades: Trade[] }>(`/trades/${id}`),
    enabled: id > 0,
  });

  const acceptMut = useMutation({
    mutationFn: (tradeId: number) => apiPost(`/trades/${tradeId}/accept`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', id] }),
  });

  const rejectMut = useMutation({
    mutationFn: (tradeId: number) => apiPost(`/trades/${tradeId}/reject`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', id] }),
  });

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (isLoading) return <div className="py-8">Loading…</div>;

  const trades = data?.trades ?? [];
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => apiGet<{ user: { id: number } }>('/auth/me') });
  const myId = me?.user?.id;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ocean-900">Trades</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>
      <p className="text-ocean-600 text-sm mb-4">Propose and accept trades. Trades lock with the weekly deadline.</p>
      <ul className="space-y-4">
        {trades.map((t) => (
          <li key={t.id} className="rounded-xl border border-sand-300 bg-sand-50 p-4">
            <p className="text-sm text-ocean-600">Status: {t.status}</p>
            {t.note && <p className="text-ocean-700 mt-1">{t.note}</p>}
            <ul className="mt-2 text-sm">
              {t.items.map((it, i) => (
                <li key={i}>{it.side}: {it.type} {it.contestantId ?? it.points}</li>
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
      {trades.length === 0 && <p className="text-ocean-600">No trades yet.</p>}
    </div>
  );
}
