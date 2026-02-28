import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { getNextLockTime } from '../lib/lock';
import { useCurrentLeague } from '../hooks/useCurrentLeague';

type League = { id: number; name: string; seasonName?: string };
type RosterItem = { id: number; contestantId: number; name: string; status: string };
type Episode = { id: number; leagueId: number; episodeNumber: number; title: string | null; airDate: string; lockAt: string };
type WinnerPick = { id: number; contestantId: number; name: string; pickedAt: string } | null;
type LeaderboardRow = { userId: number; username: string; total: number };

function LockCountdown({ lockAt }: { lockAt: Date }) {
  const now = new Date();
  const ms = lockAt.getTime() - now.getTime();
  if (ms <= 0) return <span className="text-ember-600 font-semibold">Locked</span>;
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return (
    <span className="font-display text-2xl tracking-wide text-ocean-800">
      {days}d {hours}h
    </span>
  );
}

function OnboardingCard({
  league,
  rosterCount,
  hasWinnerPick,
}: {
  league: League;
  rosterCount: number;
  hasWinnerPick: boolean;
}) {
  if (rosterCount < 2) {
    return (
      <div className="card-tribal p-6 bg-gradient-to-br from-ember-700 to-ember-800 text-white border-0">
        <h2 className="font-display text-xl tracking-wide mb-2">Complete your team</h2>
        <p className="text-white/90 text-sm mb-4">Pick 2–3 contestants for {league.name}.</p>
        <Link to={`/team/${league.id}`} className="btn-primary inline-block">
          Build your roster
        </Link>
      </div>
    );
  }
  if (!hasWinnerPick) {
    return (
      <div className="card-tribal p-6 bg-gradient-to-br from-ocean-700 to-ocean-800 text-white border-0">
        <h2 className="font-display text-xl tracking-wide mb-2">Set your winner pick</h2>
        <p className="text-white/90 text-sm mb-4">Choose who you think will win the season.</p>
        <Link to={`/picks/${league.id}`} className="btn-primary inline-block">
          Set winner pick
        </Link>
      </div>
    );
  }
  return (
    <div className="card-tribal p-6 bg-gradient-to-br from-jungle-700 to-jungle-800 text-white border-0">
      <h2 className="font-display text-xl tracking-wide mb-2">You&apos;re ready</h2>
      <p className="text-white/90 text-sm">All set for this season. Make your vote predictions each week.</p>
    </div>
  );
}

function ThisWeekCard({ leagueId, episodes }: { leagueId: number; episodes: Episode[] }) {
  const now = new Date();
  const next = episodes.find((ep) => new Date(ep.lockAt) > now);
  const lockDate = next ? new Date(next.lockAt) : getNextLockTime();
  return (
    <div className="card-tribal p-6 bg-gradient-to-br from-ocean-800 to-ocean-900 text-white border-0">
      <p className="text-sm text-white/80 mb-1">This week</p>
      {next ? (
        <>
          <p className="text-ocean-200 text-xs mb-1">
            Episode {next.episodeNumber} {next.title ? `— ${next.title}` : ''}
          </p>
          <p className="text-ocean-200 text-xs mb-2">Wednesday 8:00 PM ET</p>
          <p className="mb-4">
            <LockCountdown lockAt={lockDate} />
          </p>
          <Link to={`/picks/${leagueId}`} className="btn-primary inline-block">
            Make predictions
          </Link>
        </>
      ) : (
        <>
          <p className="text-ocean-200 text-xs mb-2">Next lock — Wednesday 8:00 PM ET</p>
          <p className="font-display text-4xl tracking-wide mb-2">
            <LockCountdown lockAt={lockDate} />
          </p>
          <Link to={`/picks/${leagueId}`} className="btn-primary inline-block">
            Make predictions
          </Link>
        </>
      )}
    </div>
  );
}

function LeagueCard({ league }: { league: League }) {
  return (
    <li>
      <div className="card-tribal p-5 block">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/team/${league.id}`} className="flex-1 min-w-0">
            <span className="font-semibold text-ocean-900">{league.name}</span>
            {league.seasonName && <span className="text-ocean-600 ml-2">— {league.seasonName}</span>}
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 mt-2 ml-0">
          <Link to={`/team/${league.id}`} className="text-ember-600 hover:text-ember-700 font-medium text-sm">
            My Team
          </Link>
          <Link to={`/picks/${league.id}`} className="text-jungle-600 hover:text-jungle-700 font-medium text-sm">
            Picks
          </Link>
          <Link to={`/trades/${league.id}`} className="text-ocean-600 hover:text-ocean-700 font-medium text-sm">
            Trades
          </Link>
          <Link to={`/leaderboard/${league.id}`} className="text-ocean-600 hover:text-ocean-700 font-medium text-sm">
            Leaderboard
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function Dashboard() {
  const { league: currentLeague, isLoading: leagueLoading, error: leagueError } = useCurrentLeague();
  const firstLeague = currentLeague ?? null;

  const { data: teamData } = useQuery({
    queryKey: ['teams', firstLeague?.id],
    queryFn: () => apiGet<{ roster: RosterItem[] }>(`/teams/${firstLeague!.id}`),
    enabled: !!firstLeague?.id,
  });
  const rosterCount = teamData?.roster?.length ?? 0;

  const { data: winnerData } = useQuery({
    queryKey: ['predictions', 'winner', firstLeague?.id],
    queryFn: () => apiGet<{ pick: WinnerPick }>(`/predictions/winner/${firstLeague!.id}`),
    enabled: !!firstLeague?.id,
  });
  const hasWinnerPick = !!winnerData?.pick;

  const { data: episodesData } = useQuery({
    queryKey: ['leagues', firstLeague?.id, 'episodes'],
    queryFn: () => apiGet<{ episodes: Episode[] }>(`/leagues/${firstLeague!.id}/episodes`),
    enabled: !!firstLeague?.id,
  });
  const episodes = episodesData?.episodes ?? [];

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['leaderboard', firstLeague?.id],
    queryFn: () => apiGet<{ leaderboard: LeaderboardRow[] }>(`/leaderboard/${firstLeague!.id}`),
    enabled: !!firstLeague?.id,
  });
  const leaderboardRows = leaderboardData?.leaderboard ?? [];

  if (leagueLoading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="text-ocean-600">Loading…</div>
      </div>
    );
  }

  if (leagueError) {
    return (
      <div className="py-12 px-4">
        <h1 className="font-display text-3xl tracking-wide text-ocean-900 mb-2">Dashboard</h1>
        <div className="card-tribal p-6 border-ember-200 bg-ember-50">
          <p className="text-ember-700 font-medium mb-1">Couldn&apos;t load your league.</p>
          <p className="text-ocean-600 text-sm">Check that the API URL is correct and CORS allows this site. Try logging in again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="font-display text-3xl md:text-4xl tracking-wide text-ocean-900 mb-2">Dashboard</h1>
      <p className="text-ocean-600 mb-8">Your league and this week&apos;s lock countdown.</p>

      {!firstLeague ? (
        <div className="card-tribal p-6 border-ember-200 bg-ember-50">
          <p className="text-ocean-700 font-medium">You&apos;re not in the league yet.</p>
          <p className="text-ocean-600 text-sm mt-1">Contact your admin to be added as a player.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 mb-8">
            <OnboardingCard
              league={firstLeague}
              rosterCount={rosterCount}
              hasWinnerPick={hasWinnerPick}
            />
            <ThisWeekCard leagueId={firstLeague.id} episodes={episodes} />
          </div>

          <ul className="space-y-4 mt-6">
            <LeagueCard league={firstLeague} />
          </ul>

          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl tracking-wide text-ocean-900">Leaderboard</h2>
              <Link to={`/leaderboard/${firstLeague.id}`} className="text-ember-600 hover:underline text-sm font-medium">
                View full leaderboard →
              </Link>
            </div>
            {leaderboardLoading ? (
              <p className="text-ocean-600 text-sm">Loading…</p>
            ) : (
              <div className="card-tribal overflow-hidden">
                <table className="w-full">
                  <thead className="bg-ocean-800 text-white">
                    <tr>
                      <th className="text-left p-3">#</th>
                      <th className="text-left p-3">Player</th>
                      <th className="text-right p-3">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardRows.map((r, i) => (
                      <tr key={r.userId} className="border-t border-sand-200">
                        <td className="p-3">{i + 1}</td>
                        <td className="p-3 font-medium">{r.username}</td>
                        <td className="p-3 text-right">{Number(r.total).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
