import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { ContestantAvatar } from '../components/ContestantAvatar';

type Contestant = { id: number; name: string; status?: string };
type Allocation = { contestantId: number; votes: number; name?: string };

function useTargetEpisode(
  episodes: { id: number; episodeNumber: number; title: string | null; lockAt: string }[] | undefined
) {
  const now = new Date();
  return useMemo(() => {
    if (!episodes?.length) return null;
    const sorted = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
    const firstUnlocked = sorted.find((e) => new Date(e.lockAt) > now);
    if (firstUnlocked) return firstUnlocked;
    return sorted[sorted.length - 1] ?? null;
  }, [episodes]);
}

export default function Picks() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { id: number } }>('/auth/me'),
    enabled: id > 0,
  });
  const myUserId = meData?.user?.id;

  const { data: winnerData } = useQuery({
    queryKey: ['winner-pick', id],
    queryFn: () =>
      apiGet<{ pick: { contestantId: number; name: string } | null; locked: boolean }>(
        `/predictions/winner/${id}`
      ),
    enabled: id > 0,
  });

  const { data: episodesData } = useQuery({
    queryKey: ['episodes', id],
    queryFn: () =>
      apiGet<{
        episodes: { id: number; episodeNumber: number; title: string | null; lockAt: string }[];
      }>(`/leagues/${id}/episodes`),
    enabled: id > 0,
  });

  const targetEpisode = useTargetEpisode(episodesData?.episodes);

  const { data: contestantsData } = useQuery({
    queryKey: ['contestants', id],
    queryFn: () => apiGet<{ contestants: Contestant[] }>(`/leagues/${id}/contestants`),
    enabled: id > 0,
  });

  const { data: votesData, isLoading: votesLoading } = useQuery({
    queryKey: ['predictions-votes', id, targetEpisode?.id ?? 0],
    queryFn: () =>
      apiGet<{
        episodeId: number;
        locked: boolean;
        lockAt: string;
        allocations: Allocation[];
        voteTotal: number;
      }>(`/predictions/votes/${id}/${targetEpisode!.id}`),
    enabled: id > 0 && !!targetEpisode?.id,
  });

  const { data: breakdownData } = useQuery({
    queryKey: ['leaderboard', id, 'breakdown'],
    queryFn: () =>
      apiGet<{
        leaderboard: { userId: number; vote_prediction: number; total: number }[];
      }>(`/leaderboard/${id}/breakdown`),
    enabled: id > 0 && !!myUserId,
  });

  const allContestants = contestantsData?.contestants ?? [];
  const activeContestants = useMemo(
    () => allContestants.filter((c) => (c as { status?: string }).status === 'active'),
    [allContestants]
  );
  const contestantById = useMemo(() => {
    const m: Record<number, Contestant> = {};
    for (const c of allContestants) m[c.id] = c;
    return m;
  }, [allContestants]);

  const voteTotal = votesData?.voteTotal ?? 10;
  const locked = votesData?.locked ?? true;
  const allocationsMap = useMemo(() => {
    const m: Record<number, number> = {};
    for (const a of votesData?.allocations ?? []) m[a.contestantId] = a.votes;
    return m;
  }, [votesData?.allocations]);

  const [localVotes, setLocalVotes] = useState<Record<number, number>>({});

  useEffect(() => {
    if (activeContestants.length === 0) return;
    const m: Record<number, number> = {};
    for (const c of activeContestants) m[c.id] = allocationsMap[c.id] ?? 0;
    setLocalVotes(m);
  }, [allocationsMap, activeContestants]);

  const currentTotal = useMemo(
    () => activeContestants.reduce((s, c) => s + (localVotes[c.id] ?? 0), 0),
    [activeContestants, localVotes]
  );
  const pointsRemain = voteTotal - currentTotal;

  const setWinner = useMutation({
    mutationFn: (contestantId: number) => apiPost(`/predictions/winner/${id}`, { contestantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['winner-pick', id] }),
  });

  const putVotes = useMutation({
    mutationFn: (allocations: { contestantId: number; votes: number }[]) =>
      apiPut(`/predictions/votes/${id}/${targetEpisode!.id}`, { allocations }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['predictions-votes', id, targetEpisode?.id ?? 0] });
      qc.invalidateQueries({ queryKey: ['leaderboard', id, 'breakdown'] });
    },
  });

  const handleSubmitVotes = () => {
    if (currentTotal !== voteTotal || !targetEpisode) return;
    putVotes.mutate(
      activeContestants.map((c) => ({ contestantId: c.id, votes: localVotes[c.id] ?? 0 }))
    );
  };

  const setVote = (contestantId: number, votes: number) => {
    if (locked) return;
    setLocalVotes((prev) => ({
      ...prev,
      [contestantId]: Math.max(0, Math.min(voteTotal, votes)),
    }));
  };

  const myVotePoints =
    breakdownData?.leaderboard?.find((r) => r.userId === myUserId)?.vote_prediction ?? 0;

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (leagueLoading) return <div className="py-8">Loading…</div>;
  if (currentLeague && id !== currentLeague.id)
    return <Navigate to={`/picks/${currentLeague.id}`} replace />;

  const episodes = episodesData?.episodes ?? [];
  const sortedEpisodes = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ocean-900">Voting Booth</h1>
        <Link to="/dashboard" className="text-ember-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      {/* Winner pick */}
      <section className="rounded-xl border border-sand-300 bg-sand-50 p-4 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-2">Winner pick</h2>
        {winnerData?.locked && <p className="text-amber-700 text-sm mb-2">Locked.</p>}
        {winnerData?.pick && (
          <p className="text-ocean-800 flex items-center gap-2">
            <ContestantAvatar name={winnerData.pick.name} size="md" />
            <span>
              Your pick: <strong>{winnerData.pick.name}</strong>
            </span>
          </p>
        )}
        {!winnerData?.locked && (
          <WinnerPickForm
            leagueId={id}
            currentId={winnerData?.pick?.contestantId}
            onSave={(cid) => setWinner.mutate(cid)}
          />
        )}
      </section>

      {/* Voting booth – current episode */}
      <section className="rounded-xl border border-ocean-200 bg-white p-4 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-2">Episode vote predictions</h2>
        {!targetEpisode ? (
          <p className="text-ocean-600">No episodes yet.</p>
        ) : votesLoading || !votesData ? (
          <p className="text-ocean-600">Loading…</p>
        ) : (
          <>
            <p className="text-ocean-600 text-sm mb-1">
              {targetEpisode.title ?? `Episode ${targetEpisode.episodeNumber}`} — lock:{' '}
              {new Date(votesData.lockAt).toLocaleString()}
            </p>
            <p className="text-ocean-600 text-sm mb-3">
              Only active contestants are shown; players who are eliminated or otherwise out of the game (e.g. evacuated) do not appear here.
              Allocate {voteTotal} votes across them. How likely is each to be voted out?
            </p>
            {locked && (
              <p className="rounded-lg bg-amber-100 text-amber-800 p-3 mb-4">
                Predictions are locked for this episode.
              </p>
            )}
            <div className="card-tribal divide-y divide-sand-200">
              {activeContestants.map((c) => {
                const votes = localVotes[c.id] ?? 0;
                return (
                  <div key={c.id} className="flex items-center gap-4 p-4">
                    <ContestantAvatar name={c.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-ocean-900">{c.name}</span>
                      <p
                        className="text-sand-500 text-xs mt-0.5"
                        title="How likely is this survivor to go home?"
                      >
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
                          <span className="w-10 text-right font-semibold text-ocean-800 tabular-nums">
                            {votes}
                          </span>
                        </>
                      )}
                      {locked && (
                        <span className="font-semibold text-ocean-800 tabular-nums">
                          {votes} votes
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!locked && (
              <div className="mt-4 flex items-center gap-4">
                <div className="rounded-xl bg-ocean-800 text-white px-4 py-2 text-right">
                  <div className="text-xs uppercase tracking-wide text-ocean-200">Points remain</div>
                  <div className="text-2xl font-bold">{pointsRemain}</div>
                </div>
                <button
                  type="button"
                  onClick={handleSubmitVotes}
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
          </>
        )}
      </section>

      {/* Vote stats */}
      <section className="rounded-xl border border-sand-200 bg-sand-50 p-4 mb-6">
        <h2 className="font-semibold text-ocean-800 mb-2">Your vote performance</h2>
        <p className="text-ocean-800">
          <strong>Vote points:</strong> {myVotePoints} — points earned from correct vote predictions.
        </p>
      </section>

      {/* Other episodes – collapsible */}
      <section className="rounded-xl border border-sand-200 bg-sand-50 p-4">
        <h2 className="font-semibold text-ocean-800 mb-2">Past / other episodes</h2>
        <p className="text-ocean-600 text-sm mb-3">
          View your saved vote allocations for other episodes. Locked episodes are read-only.
        </p>
        {sortedEpisodes.length === 0 ? (
          <p className="text-ocean-600 text-sm">No episodes yet.</p>
        ) : (
          <ul className="space-y-2">
            {sortedEpisodes.map((ep) => (
              <OtherEpisodeRow
                key={ep.id}
                leagueId={id}
                episode={ep}
                contestantById={contestantById}
                isActive={ep.id === targetEpisode?.id}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WinnerPickForm({
  leagueId,
  currentId,
  onSave,
}: {
  leagueId: number;
  currentId?: number;
  onSave: (contestantId: number) => void;
}) {
  const { data } = useQuery({
    queryKey: ['contestants', leagueId],
    queryFn: () =>
      apiGet<{ contestants: { id: number; name: string }[] }>(`/leagues/${leagueId}/contestants`),
  });
  const [value, setValue] = useState(currentId ?? 0);
  return (
    <div>
      <select
        value={value || ''}
        onChange={(e) => setValue(parseInt(e.target.value, 10))}
        className="rounded border border-sand-300 px-3 py-2"
      >
        <option value="">Choose winner…</option>
        {(data?.contestants ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => value && onSave(value)}
        className="ml-2 rounded bg-ember-500 px-4 py-2 text-white text-sm hover:bg-ember-600"
      >
        Save
      </button>
    </div>
  );
}

function OtherEpisodeRow({
  leagueId,
  episode,
  contestantById,
  isActive,
}: {
  leagueId: number;
  episode: { id: number; episodeNumber: number; title: string | null; lockAt: string };
  contestantById: Record<number, Contestant>;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: votesData } = useQuery({
    queryKey: ['predictions-votes', leagueId, episode.id],
    queryFn: () =>
      apiGet<{
        episodeId: number;
        locked: boolean;
        allocations: { contestantId: number; votes: number; name?: string }[];
        voteTotal: number;
      }>(`/predictions/votes/${leagueId}/${episode.id}`),
    enabled: expanded,
  });
  const title = episode.title ?? `Episode ${episode.episodeNumber}`;
  return (
    <li className="border border-sand-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-sand-100 hover:bg-sand-200"
      >
        <span className="font-medium text-ocean-800">
          {title}
          {isActive && (
            <span className="ml-2 text-xs text-ember-600 font-normal">(current)</span>
          )}
        </span>
        <span className="text-sand-500 text-sm">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && votesData && (
        <div className="p-3 bg-white border-t border-sand-200">
          <p className="text-sand-600 text-xs mb-2">
            Your saved allocations (read-only). Contestants since eliminated are marked.
          </p>
          <ul className="space-y-1">
            {(votesData.allocations ?? [])
              .filter((a) => a.votes > 0)
              .map((a) => {
                const c = contestantById[a.contestantId];
                const outOfGame = c && (c as { status?: string }).status !== 'active';
                return (
                  <li key={a.contestantId} className="flex items-center gap-2 text-sm">
                    <span className="text-ocean-800">{a.name ?? `Contestant #${a.contestantId}`}</span>
                    <span className="text-sand-500">{a.votes} votes</span>
                    {outOfGame && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                        Out
                      </span>
                    )}
                  </li>
                );
              })}
            {(!votesData.allocations?.length || votesData.allocations.every((a) => a.votes === 0)) && (
              <li className="text-sand-500 text-sm">No votes saved for this episode.</li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}
