import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { ContestantAvatar } from '../components/ContestantAvatar';
import FunFacts from '../components/FunFacts';

type RosterItem = { id: number; contestantId: number; name: string; status: string };
type Contestant = { id: number; name: string; status: string };

type ContestantStats = {
  contestantId: number;
  name: string;
  status: string;
  individualImmunityWins: number;
  tribeRewardWins: number;
  tribeImmunityWins: number;
  idolFound: number;
  idolPlayed: number;
  survivedTribal: number;
  eliminated: number;
};

type EpisodePoints = {
  episodeId: number;
  episodeNumber: number;
  title: string | null;
  pointsByUser: { userId: number; username: string; points: number }[];
};

export default function MyTeam() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { id: number; role: string } }>('/auth/me'),
  });
  const isAdmin = me?.user?.role === 'admin';

  const { data: breakdownData } = useQuery({
    queryKey: ['leaderboard', id, 'breakdown'],
    queryFn: () => apiGet<{ leaderboard: { userId: number; scoring_event: number; total: number }[] }>(`/leaderboard/${id}/breakdown`),
    enabled: id > 0,
  });
  const leaderboardOrder = breakdownData?.leaderboard ?? [];
  const myBreakdown = leaderboardOrder.find((r) => r.userId === me?.user?.id);
  const myRank = myBreakdown ? leaderboardOrder.findIndex((r) => r.userId === me?.user?.id) + 1 : null;

  const { data: statsData } = useQuery({
    queryKey: ['leagues', id, 'stats'],
    queryFn: () => apiGet<{ contestants: ContestantStats[] }>(`/leagues/${id}/stats`),
    enabled: id > 0,
  });
  const statsByContestant = (statsData?.contestants ?? []).reduce(
    (acc, c) => {
      acc[c.contestantId] = c;
      return acc;
    },
    {} as Record<number, ContestantStats>
  );

  const { data: byEpisodeData } = useQuery({
    queryKey: ['leaderboard', id, 'by-episode'],
    queryFn: () => apiGet<{ episodes: EpisodePoints[] }>(`/leaderboard/${id}/by-episode`),
    enabled: id > 0,
  });
  const myPointsByEpisode = (() => {
    const epList = byEpisodeData?.episodes ?? [];
    const myId = me?.user?.id;
    if (myId == null) return [];
    return epList.map((ep) => ({
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      points: ep.pointsByUser.find((u) => u.userId === myId)?.points ?? 0,
    }));
  })();

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: () => apiGet<{ roster: RosterItem[]; locked: boolean; lockAt: string | null }>(`/teams/${id}`),
    enabled: id > 0,
  });

  const { data: contestantsData } = useQuery({
    queryKey: ['contestants', id],
    queryFn: () => apiGet<{ contestants: Contestant[] }>(`/leagues/${id}/contestants`),
    enabled: id > 0 && !!teamData && !teamData.locked && isAdmin,
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
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && id !== currentLeague.id) return <Navigate to={`/team/${currentLeague.id}`} replace />;
  if (isLoading || !teamData) return <div className="py-8">Loading…</div>;

  const roster = teamData.roster;
  const onRosterIds = new Set(roster.map((r) => r.contestantId));
  const available = (contestantsData?.contestants ?? []).filter((c) => !onRosterIds.has(c.id));

  const activeCount = roster.filter((r) => r.status === 'active').length;
  const eliminatedCount = roster.length - activeCount;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ocean-900">My Team</h1>
          <p className="text-ocean-600 text-sm mt-1">Your tribe. Your edge.</p>
        </div>
        <Link to="/dashboard" className="text-ember-600 hover:underline">← Dashboard</Link>
      </div>
      {teamData.locked && (
        <p className="rounded-lg bg-amber-100 text-amber-800 p-3 mb-4">Roster is locked until after the next episode.</p>
      )}

      {roster.length === 0 ? (
        <div className="card-tribal p-6 mb-6 text-center">
          <p className="text-ocean-700">Your roster is empty.</p>
          <p className="text-ocean-600 text-sm mt-2">An admin will add your contestants.</p>
        </div>
      ) : (
        <>
          <div className="card-tribal p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="text-sm font-medium text-ocean-700">Total points</h3>
              <p className="text-xl font-bold text-ocean-900">{myBreakdown != null ? Number(myBreakdown.total).toFixed(0) : '—'}</p>
              <p className="text-sand-600 text-xs">All categories</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-ocean-700">Roster points</h3>
              <p className="text-xl font-bold text-ocean-900">{myBreakdown != null ? Number(myBreakdown.scoring_event).toFixed(0) : '—'}</p>
              <p className="text-sand-600 text-xs">From team outcomes</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-ocean-700">Leaderboard rank</h3>
              <p className="text-xl font-bold text-ocean-900">
                {myRank != null ? `#${myRank} of ${leaderboardOrder.length}` : '—'}
              </p>
              <p className="text-sand-600 text-xs">Current standing</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-ocean-700">Roster status</h3>
              <p className="text-ocean-900">
                {activeCount} active{eliminatedCount > 0 ? `, ${eliminatedCount} out` : ''}
              </p>
            </div>
          </div>
          {myPointsByEpisode.length > 0 && (
            <div className="card-tribal p-4 mb-4">
              <h3 className="text-sm font-medium text-ocean-700 mb-2">Points by episode</h3>
              <div className="flex flex-wrap gap-3">
                {myPointsByEpisode.map((ep) => (
                  <span key={ep.episodeNumber} className="inline-flex items-center gap-1.5 rounded-full bg-ocean-100 px-2.5 py-0.5 text-sm text-ocean-800">
                    <span className="font-medium">Ep {ep.episodeNumber}</span>
                    <span>{Number(ep.points).toFixed(0)} pts</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-sand-500 text-xs mb-4">Lock is Wednesday 8:00 PM ET. Rosters lock each week until the next episode.</p>

      <div className="card-tribal p-6 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-4">Your roster (2–3 contestants)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {roster.map((r) => {
            const stats = statsByContestant[r.contestantId];
            const isOut = r.status !== 'active';
            return (
              <div
                key={r.id}
                className={`rounded-xl border border-sand-200 bg-gradient-to-b from-white to-sand-50/50 p-4 flex flex-col items-center text-center ${isOut ? 'opacity-80' : ''}`}
              >
                <div className="relative">
                  <ContestantAvatar name={r.name} size="lg" />
                  {isOut && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-ember-500 px-2 py-0.5 text-xs font-semibold text-white">
                      Out
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-ocean-900 mt-3">{r.name}</h3>
                {stats ? (
                  <div className="mt-3 w-full grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-ocean-50 px-2 py-1.5 text-ocean-800">
                      <span className="text-ocean-500 block">Ind. immunity</span>
                      <span className="font-semibold">{stats.individualImmunityWins}</span>
                    </div>
                    <div className="rounded-lg bg-jungle-50 px-2 py-1.5 text-jungle-800">
                      <span className="text-jungle-600 block">Tribe (R/I)</span>
                      <span className="font-semibold">{stats.tribeRewardWins}/{stats.tribeImmunityWins}</span>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
                      <span className="text-amber-600 block">Idols</span>
                      <span className="font-semibold">F:{stats.idolFound} P:{stats.idolPlayed}</span>
                    </div>
                    <div className="rounded-lg bg-sand-100 px-2 py-1.5 text-sand-800">
                      <span className="text-sand-600 block">Survived</span>
                      <span className="font-semibold">{stats.survivedTribal}</span>
                    </div>
                    <div className="col-span-2 rounded-lg px-2 py-1.5 text-center">
                      {stats.eliminated > 0 ? (
                        <span className="text-ember-600 font-medium">Eliminated</span>
                      ) : (
                        <span className="text-sand-500">Active</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sand-500 text-sm mt-2">Loading stats…</p>
                )}
                {isAdmin && !teamData.locked && roster.length > 2 && (
                  <button
                    onClick={() => removeMut.mutate(r.contestantId)}
                    className="mt-3 text-red-600 text-sm hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {isAdmin && !teamData.locked && roster.length < 3 && available.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-ocean-800 mb-1">Add contestant</label>
            <select
              className="input-tribal max-w-xs"
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
          <div className="mt-6">
            <FunFacts />
          </div>
        </>
      )}
    </div>
  );
}
