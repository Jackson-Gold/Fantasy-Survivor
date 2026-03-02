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
        <h2 className="font-semibold text-ocean-800 mb-3">Your roster (2–3 contestants)</h2>
        <ul className="space-y-3">
          {roster.map((r) => {
            const stats = statsByContestant[r.contestantId];
            const isOut = r.status !== 'active';
            return (
            <li key={r.id} className={`flex items-center gap-3 ${isOut ? 'opacity-75' : ''}`}>
              <ContestantAvatar name={r.name} size="lg" />
              <div className="flex-1">
                <span className="font-medium text-ocean-900">{r.name}</span>
                {isOut && (
                  <span className="text-ember-600 text-sm ml-2 font-medium">(out)</span>
                )}
                {stats ? (
                  <div className="text-sand-600 text-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {stats.individualImmunityWins > 0 && <span>Individual immunity: {stats.individualImmunityWins}</span>}
                    {(stats.tribeRewardWins > 0 || stats.tribeImmunityWins > 0) && (
                      <span>Tribe wins: Rwd {stats.tribeRewardWins} / Imm {stats.tribeImmunityWins}</span>
                    )}
                    {(stats.idolFound > 0 || stats.idolPlayed > 0) && (
                      <span>Idols: found {stats.idolFound}, played {stats.idolPlayed}</span>
                    )}
                    {stats.survivedTribal > 0 && <span>Survived tribal: {stats.survivedTribal}</span>}
                    {stats.eliminated > 0 && <span className="text-ember-600">Eliminated</span>}
                    {!stats.individualImmunityWins && !stats.tribeRewardWins && !stats.tribeImmunityWins && !stats.idolFound && !stats.idolPlayed && stats.survivedTribal === 0 && stats.eliminated === 0 && (
                      <span>No stats yet</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sand-600 text-sm mt-0.5">Loading stats…</p>
                )}
              </div>
              {isAdmin && !teamData.locked && roster.length > 2 && (
                <button
                  onClick={() => removeMut.mutate(r.contestantId)}
                  className="text-red-600 text-sm hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          );
          })}
        </ul>
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
