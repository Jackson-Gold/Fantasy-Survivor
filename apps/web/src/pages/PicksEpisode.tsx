import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { ContestantAvatar } from '../components/ContestantAvatar';

type Contestant = { id: number; name: string; status?: string };
type Allocation = { contestantId: number; votes: number; name?: string };

export default function PicksEpisode() {
  const { leagueId, episodeId } = useParams<{ leagueId: string; episodeId: string }>();
  const qc = useQueryClient();
  const leagueIdNum = parseInt(leagueId ?? '0', 10);
  const episodeIdNum = parseInt(episodeId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data: episodeData } = useQuery({
    queryKey: ['episodes', leagueIdNum],
    queryFn: () =>
      apiGet<{ episodes: { id: number; episodeNumber: number; title: string | null; lockAt: string }[] }>(
        `/leagues/${leagueIdNum}/episodes`
      ),
    enabled: leagueIdNum > 0,
  });

  const { data: contestantsData } = useQuery({
    queryKey: ['contestants', leagueIdNum],
    queryFn: () => apiGet<{ contestants: Contestant[] }>(`/leagues/${leagueIdNum}/contestants`),
    enabled: leagueIdNum > 0,
  });

  const { data: votesData, isLoading: votesLoading } = useQuery({
    queryKey: ['predictions-votes', leagueIdNum, episodeIdNum],
    queryFn: () =>
      apiGet<{
        episodeId: number;
        locked: boolean;
        lockAt: string;
        allocations: Allocation[];
        voteTotal: number;
      }>(`/predictions/votes/${leagueIdNum}/${episodeIdNum}`),
    enabled: leagueIdNum > 0 && episodeIdNum > 0,
  });

  const episode = episodeData?.episodes?.find((e) => e.id === episodeIdNum);
  const allContestants = contestantsData?.contestants ?? [];
  const contestants = useMemo(
    () => allContestants.filter((c) => (c as { status?: string }).status !== 'eliminated'),
    [allContestants]
  );
  const voteTotal = votesData?.voteTotal ?? 10;
  const locked = votesData?.locked ?? true;
  const allocationsMap = useMemo(() => {
    const m: Record<number, number> = {};
    for (const a of votesData?.allocations ?? []) m[a.contestantId] = a.votes;
    return m;
  }, [votesData?.allocations]);

  const [localVotes, setLocalVotes] = useState<Record<number, number>>({});

  useEffect(() => {
    if (contestants.length === 0) return;
    const m: Record<number, number> = {};
    for (const c of contestants) m[c.id] = allocationsMap[c.id] ?? 0;
    setLocalVotes(m);
  }, [allocationsMap, contestants]);

  const currentTotal = useMemo(
    () => contestants.reduce((s, c) => s + (localVotes[c.id] ?? 0), 0),
    [contestants, localVotes]
  );
  const pointsRemain = voteTotal - currentTotal;

  const putVotes = useMutation({
    mutationFn: (allocations: { contestantId: number; votes: number }[]) =>
      apiPut(`/predictions/votes/${leagueIdNum}/${episodeIdNum}`, { allocations }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['predictions-votes', leagueIdNum, episodeIdNum] });
    },
  });

  const handleSubmit = () => {
    if (currentTotal !== voteTotal) return;
    putVotes.mutate(
      contestants.map((c) => ({ contestantId: c.id, votes: localVotes[c.id] ?? 0 }))
    );
  };

  const setVote = (contestantId: number, votes: number) => {
    if (locked) return;
    setLocalVotes((prev) => ({ ...prev, [contestantId]: Math.max(0, Math.min(voteTotal, votes)) }));
  };

  if (!leagueId || leagueIdNum <= 0 || !episodeId || episodeIdNum <= 0)
    return <div className="py-8">Invalid league or episode.</div>;
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && leagueIdNum !== currentLeague.id)
    return <Navigate to={`/picks/${currentLeague.id}/episode/${episodeIdNum}`} replace />;
  if (!episode) return <div className="py-8">Episode not found.</div>;
  if (votesLoading || !votesData) return <div className="py-8">Loading…</div>;

  const title = episode.title ?? `Episode ${episode.episodeNumber}`;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to={`/picks/${leagueIdNum}`} className="text-ember-600 hover:underline text-sm mb-1 inline-block">
            ← Picks
          </Link>
          <h1 className="text-2xl font-bold text-ocean-900">{title}</h1>
        </div>
        <div className="rounded-xl bg-ocean-800 text-white px-4 py-2 text-right">
          <div className="text-xs uppercase tracking-wide text-ocean-200">Points remain</div>
          <div className="text-2xl font-bold">{pointsRemain}</div>
        </div>
      </div>

      {locked && (
        <p className="rounded-lg bg-amber-100 text-amber-800 p-3 mb-4">
          Predictions are locked for this episode.
        </p>
      )}

      <p className="text-ocean-600 text-sm mb-4">
        Allocate {voteTotal} votes across active contestants. How likely is each to be voted out?
      </p>

      <div className="card-tribal divide-y divide-sand-200">
        {contestants.map((c) => {
          const votes = localVotes[c.id] ?? 0;
          return (
            <div
              key={c.id}
              className="flex items-center gap-4 p-4"
            >
              <ContestantAvatar name={c.name} size="lg" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-ocean-900">{c.name}</span>
                <p className="text-sand-500 text-xs mt-0.5" title="How likely is this survivor to go home?">
                  How likely is this survivor to go home?
                </p>
              </div>
              <div className="flex items-center gap-4 flex-1 max-w-md">
                {!locked && (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={voteTotal}
                      value={votes}
                      onChange={(e) => setVote(c.id, parseInt(e.target.value, 10))}
                      className="flex-1 h-3 rounded-full appearance-none bg-sand-200 accent-ember-500"
                    />
                    <span className="w-10 text-right font-semibold text-ocean-800 tabular-nums">{votes}</span>
                  </>
                )}
                {locked && <span className="font-semibold text-ocean-800 tabular-nums">{votes} votes</span>}
              </div>
            </div>
          );
        })}
      </div>

      {!locked && (
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={currentTotal !== voteTotal || putVotes.isPending}
            className="btn-primary disabled:opacity-70"
          >
            {putVotes.isPending ? 'Saving…' : 'Submit'}
          </button>
          {currentTotal !== voteTotal && (
            <span className="text-amber-700 text-sm">
              Total must equal {voteTotal}. Current: {currentTotal}.
            </span>
          )}
          {putVotes.isError && (
            <span className="text-red-600 text-sm">
              {(putVotes.error as { message?: string })?.message ?? 'Save failed'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
