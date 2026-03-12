import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { ContestantAvatar } from '../components/ContestantAvatar';

type RosterItem = { id: number; contestantId: number; name: string; status?: string };

type ContestantStats = {
  contestantId: number;
  name: string;
  status: string;
  individualImmunityWins: number;
  tribeRewardWins: number;
  tribeImmunityWins: number;
  idolFound: number;
  idolPlayed: number;
  advantageFound?: number;
  advantagePlayed?: number;
  survivedTribal: number;
  eliminated: number;
};

type EpisodePoints = {
  episodeId: number;
  episodeNumber: number;
  title: string | null;
  pointsByUser: { userId: number; username: string; points: number }[];
};

export default function TeamView() {
  const { leagueId, userId } = useParams<{ leagueId: string; userId: string }>();
  const leagueIdNum = parseInt(leagueId ?? '0', 10);
  const targetUserId = parseInt(userId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { id: number } }>('/auth/me'),
  });
  const myUserId = me?.user?.id;
  const isOwnTeam = myUserId != null && targetUserId === myUserId;

  const { data: rosterData, isLoading: rosterLoading } = useQuery({
    queryKey: ['team-roster', leagueIdNum, targetUserId],
    queryFn: () =>
      apiGet<{ roster: RosterItem[] }>(`/teams/${leagueIdNum}/roster/${targetUserId}`),
    enabled: leagueIdNum > 0 && targetUserId > 0 && !isOwnTeam,
  });

  const { data: breakdownData } = useQuery({
    queryKey: ['leaderboard', leagueIdNum, 'breakdown'],
    queryFn: () =>
      apiGet<{
        leaderboard: { userId: number; username: string; tribeName?: string | null; total: number; scoring_event: number }[];
      }>(`/leaderboard/${leagueIdNum}/breakdown`),
    enabled: leagueIdNum > 0,
  });
  const targetUser = breakdownData?.leaderboard?.find((r) => r.userId === targetUserId);
  const displayName = targetUser?.tribeName?.trim() || targetUser?.username || 'Player';

  const { data: statsData } = useQuery({
    queryKey: ['leagues', leagueIdNum, 'stats'],
    queryFn: () =>
      apiGet<{ contestants: ContestantStats[] }>(`/leagues/${leagueIdNum}/stats`),
    enabled: leagueIdNum > 0 && !!rosterData?.roster?.length,
  });
  const statsByContestant = (statsData?.contestants ?? []).reduce(
    (acc, c) => {
      acc[c.contestantId] = c;
      return acc;
    },
    {} as Record<number, ContestantStats>
  );

  const { data: byEpisodeData } = useQuery({
    queryKey: ['leaderboard', leagueIdNum, 'by-episode'],
    queryFn: () => apiGet<{ episodes: EpisodePoints[] }>(`/leaderboard/${leagueIdNum}/by-episode`),
    enabled: leagueIdNum > 0 && targetUserId > 0,
  });
  const pointsByEpisode = (() => {
    const epList = byEpisodeData?.episodes ?? [];
    return epList.map((ep) => ({
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      points: ep.pointsByUser.find((u) => u.userId === targetUserId)?.points ?? 0,
    }));
  })();

  if (!leagueId || leagueIdNum <= 0 || !userId || targetUserId <= 0)
    return <div className="py-8">Invalid league or user.</div>;
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && leagueIdNum !== currentLeague.id)
    return <Navigate to={`/team/${currentLeague.id}/user/${targetUserId}`} replace />;
  if (isOwnTeam) return <Navigate to={`/team/${leagueIdNum}`} replace />;
  if (rosterLoading || !rosterData) return <div className="py-8">Loading…</div>;

  const roster = rosterData.roster;
  const activeCount = roster.filter((r) => (r.status ?? 'active') === 'active').length;
  const eliminatedCount = roster.length - activeCount;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ocean-900">{displayName}&apos;s Team</h1>
          <p className="text-ocean-600 text-sm mt-1">View only — roster and stats</p>
        </div>
        <Link to={`/leaderboard/${leagueIdNum}`} className="text-ember-600 hover:underline">
          ← Leaderboard
        </Link>
      </div>

      {targetUser != null && (
        <div className="card-tribal p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="text-sm font-medium text-ocean-700">Total points</h3>
            <p className="text-xl font-bold text-ocean-900">
              {Number(targetUser.total).toFixed(0)}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ocean-700">Roster points</h3>
            <p className="text-xl font-bold text-ocean-900">
              {Number(targetUser.scoring_event).toFixed(0)}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ocean-700">Roster status</h3>
            <p className="text-ocean-900">
              {activeCount} active{eliminatedCount > 0 ? `, ${eliminatedCount} out` : ''}
            </p>
          </div>
        </div>
      )}

      {pointsByEpisode.length > 0 && (
        <div className="card-tribal p-4 mb-4">
          <h3 className="text-sm font-medium text-ocean-700 mb-2">Points by episode</h3>
          <div className="flex flex-wrap gap-3">
            {pointsByEpisode.map((ep) => (
              <span
                key={ep.episodeNumber}
                className="inline-flex items-center gap-1.5 rounded-full bg-ocean-100 px-2.5 py-0.5 text-sm text-ocean-800"
              >
                <span className="font-medium">Ep {ep.episodeNumber}</span>
                <span>{Number(ep.points).toFixed(0)} pts</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card-tribal p-6 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-4">Roster</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {roster.map((r) => {
            const stats = statsByContestant[r.contestantId];
            const isOut = (r.status ?? 'active') !== 'active';
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
                  <div className="mt-4 w-full grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-ocean-100 to-ocean-50 px-3 py-2.5 border border-ocean-200/60">
                      <span className="text-ocean-600 text-xs font-medium uppercase tracking-wide block">
                        Ind. immunity
                      </span>
                      <span className="text-ocean-900 text-lg font-bold tabular-nums">
                        {stats.individualImmunityWins}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-jungle-100 to-jungle-50 px-3 py-2.5 border border-jungle-200/60">
                      <span className="text-jungle-600 text-xs font-medium uppercase tracking-wide block">
                        Tribe immunity
                      </span>
                      <span className="text-jungle-900 text-lg font-bold tabular-nums">
                        {stats.tribeImmunityWins}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 px-3 py-2.5 border border-amber-200/60">
                      <span className="text-amber-700 text-xs font-medium uppercase tracking-wide block">
                        Tribe reward
                      </span>
                      <span className="text-amber-900 text-lg font-bold tabular-nums">
                        {stats.tribeRewardWins}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 px-3 py-2.5 border border-violet-200/60">
                      <span className="text-violet-600 text-xs font-medium uppercase tracking-wide block">
                        Idols & advantages
                      </span>
                      <span className="text-violet-900 text-lg font-bold tabular-nums">
                        {(stats.idolFound ?? 0) +
                          (stats.idolPlayed ?? 0) +
                          (stats.advantageFound ?? 0) +
                          (stats.advantagePlayed ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-sand-100 to-sand-50 px-3 py-2.5 border border-sand-200/60">
                      <span className="text-sand-600 text-xs font-medium uppercase tracking-wide block">
                        Survived tribal
                      </span>
                      <span className="text-sand-900 text-lg font-bold tabular-nums">
                        {stats.survivedTribal}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-ember-100 to-ember-50 px-3 py-2.5 border border-ember-200/60">
                      <span className="text-ember-600 text-xs font-medium uppercase tracking-wide block">
                        Status
                      </span>
                      <span
                        className={`text-lg font-bold ${stats.eliminated > 0 ? 'text-ember-700' : 'text-jungle-700'}`}
                      >
                        {stats.eliminated > 0 ? 'Eliminated' : 'Active'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sand-500 text-sm mt-2">—</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
