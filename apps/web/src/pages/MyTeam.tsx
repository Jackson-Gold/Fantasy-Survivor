import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../lib/api';

type RosterItem = { id: number; contestantId: number; name: string; status: string };
type Contestant = { id: number; name: string; status: string };

export default function MyTeam() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: () => apiGet<{ roster: RosterItem[]; locked: boolean; lockAt: string | null }>(`/teams/${id}`),
    enabled: id > 0,
  });

  const { data: contestantsData } = useQuery({
    queryKey: ['contestants', id],
    queryFn: () => apiGet<{ contestants: Contestant[] }>(`/leagues/${id}/contestants`),
    enabled: id > 0 && !!teamData && !teamData.locked,
  });

  const addMut = useMutation({
    mutationFn: (contestantId: number) => apiPost(`/teams/${id}/add`, { contestantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', id] }),
  });

  const removeMut = useMutation({
    mutationFn: (contestantId: number) => apiDelete(`/teams/${id}/${contestantId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', id] }),
  });

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (isLoading || !teamData) return <div className="py-8">Loading…</div>;

  const roster = teamData.roster;
  const onRosterIds = new Set(roster.map((r) => r.contestantId));
  const available = (contestantsData?.contestants ?? []).filter((c) => !onRosterIds.has(c.id));

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ocean-900">My Team</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>
      {teamData.locked && (
        <p className="rounded-lg bg-amber-100 text-amber-800 p-3 mb-4">Roster is locked until after the next episode.</p>
      )}
      <div className="rounded-xl border border-sand-300 bg-sand-50 p-4 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-2">Your roster (2–3 contestants)</h2>
        <ul className="space-y-2">
          {roster.map((r) => (
            <li key={r.id} className="flex justify-between items-center">
              <span>{r.name} {r.status !== 'active' && <span className="text-ocean-600">({r.status})</span>}</span>
              {!teamData.locked && roster.length > 2 && (
                <button
                  onClick={() => removeMut.mutate(r.contestantId)}
                  className="text-red-600 text-sm hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {!teamData.locked && roster.length < 3 && available.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-ocean-800 mb-1">Add contestant</label>
            <select
              className="rounded border border-sand-300 px-3 py-2"
              onChange={(e) => {
                const v = e.target.value;
                if (v) addMut.mutate(parseInt(v, 10));
              }}
            >
              <option value="">Choose…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
