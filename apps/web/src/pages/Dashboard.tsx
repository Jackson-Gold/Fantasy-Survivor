import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getNextLockTime } from '../lib/lock';
import { useCurrentLeague } from '../hooks/useCurrentLeague';

type League = { id: number; name: string; seasonName?: string };
type RosterItem = { id: number; contestantId: number; name: string; status: string };
type Episode = { id: number; leagueId: number; episodeNumber: number; title: string | null; airDate: string; lockAt: string };
type WinnerPick = { id: number; contestantId: number; name: string; pickedAt: string } | null;

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

function JoinLeagueCard({ onJoined }: { onJoined: () => void }) {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const join = useMutation({
    mutationFn: (code: string) => apiPost<League>('/leagues/join', { inviteCode: code.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
      queryClient.invalidateQueries({ queryKey: ['league-current'] });
      onJoined();
    },
    onError: (err: Error) => setError(err.message),
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inviteCode.trim()) return;
    join.mutate(inviteCode.trim());
  };
  return (
    <div className="card-tribal p-6 bg-gradient-to-br from-jungle-800 to-jungle-900 text-white border-0">
      <h2 className="font-display text-xl tracking-wide text-white mb-2">Join a league</h2>
      <p className="text-white/80 text-sm mb-4">Enter an invite code from your league host.</p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Invite code"
          className="input-tribal flex-1 min-w-0"
          maxLength={32}
          autoCapitalize="characters"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={join.isPending}>
          {join.isPending ? 'Joining…' : 'Join'}
        </button>
      </form>
      {error && <p className="text-ember-200 text-sm mt-2">{error}</p>}
    </div>
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

function LeagueCard({ league, hideLeave }: { league: League; hideLeave?: boolean }) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const leave = useMutation({
    mutationFn: () => apiDelete(`/leagues/${league.id}/members/me`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
      queryClient.invalidateQueries({ queryKey: ['league-current'] });
      setConfirmLeave(false);
      navigate('/');
    },
    onError: () => setConfirmLeave(false),
  });
  return (
    <li>
      <div className="card-tribal p-5 block">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/team/${league.id}`} className="flex-1 min-w-0">
            <span className="font-semibold text-ocean-900">{league.name}</span>
            {league.seasonName && <span className="text-ocean-600 ml-2">— {league.seasonName}</span>}
          </Link>
          {!hideLeave && !confirmLeave ? (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="text-ocean-500 hover:text-ember-600 text-sm shrink-0"
            >
              Leave
            </button>
          ) : !hideLeave ? (
            <span className="flex items-center gap-2 shrink-0 text-sm">
              <span className="text-ocean-600">Leave league?</span>
              <button
                type="button"
                onClick={() => leave.mutate()}
                className="text-ember-600 hover:text-ember-700 font-medium"
              >
                Yes
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)} className="text-ocean-600 hover:underline">
                No
              </button>
            </span>
          ) : null}
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
        <div className="grid gap-4 md:grid-cols-2 mb-10">
          <JoinLeagueCard onJoined={() => {}} />
          <div className="card-tribal p-6 flex items-center justify-center text-ocean-600">
            <p className="text-sm">No upcoming episode until you join a league.</p>
          </div>
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
            <LeagueCard league={firstLeague} hideLeave />
          </ul>
        </>
      )}
    </div>
  );
}
