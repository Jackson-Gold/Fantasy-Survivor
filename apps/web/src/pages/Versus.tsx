import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '../lib/api';
import { useCurrentLeague } from '../hooks/useCurrentLeague';
import { ContestantAvatar } from '../components/ContestantAvatar';
import { UserAvatar } from '../components/UserAvatar';

type Contestant = { id: number; name: string; status?: string };

type VersusBreakdown = {
  draftPoints: number;
  immunityBonus: number;
  bootBonus: number;
  idolBonus: number;
  predictionTotal: number;
  total: number;
};

type VersusState = {
  episode: { id: number; episodeNumber: number; title: string | null; lockAt: string };
  locked: boolean;
  config: {
    versusWinPoints: number;
    versusPredImmunityPts: number;
    versusPredBootPts: number;
    versusPredIdolPts: number;
  };
  matchup: { id: number; isBye: boolean; opponent: { userId: number; username: string; tribeName?: string | null; avatarUrl?: string | null } | null } | null;
  myDraft: { id: number; name: string }[];
  opponentDraft: { id: number; name: string }[] | null;
  predictions: {
    immunityContestantId: number | null;
    bootContestantId: number | null;
    idolContestantId: number | null;
  };
  settled: boolean;
  myBreakdown: VersusBreakdown | null;
  opponentBreakdown: VersusBreakdown | null;
  outcome: 'win' | 'loss' | 'tie' | 'bye' | null;
  winAmount: number;
};

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

export default function Versus() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const id = parseInt(leagueId ?? '0', 10);
  const { league: currentLeague, isLoading: leagueLoading } = useCurrentLeague();

  const { data: episodesData } = useQuery({
    queryKey: ['episodes', id],
    queryFn: () =>
      apiGet<{
        episodes: { id: number; episodeNumber: number; title: string | null; lockAt: string }[];
      }>(`/leagues/${id}/episodes`),
    enabled: id > 0,
  });

  const defaultEp = useTargetEpisode(episodesData?.episodes);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number | null>(null);
  const episodeId = selectedEpisodeId ?? defaultEp?.id ?? null;

  useEffect(() => {
    if (selectedEpisodeId == null && defaultEp?.id != null) {
      setSelectedEpisodeId(defaultEp.id);
    }
  }, [defaultEp?.id, selectedEpisodeId]);

  const { data: versusData, isLoading: versusLoading } = useQuery({
    queryKey: ['versus', id, episodeId],
    queryFn: () => apiGet<VersusState>(`/versus/${id}/episodes/${episodeId}`),
    enabled: id > 0 && episodeId != null && episodeId > 0,
  });

  const { data: contestantsData } = useQuery({
    queryKey: ['contestants', id],
    queryFn: () => apiGet<{ contestants: Contestant[] }>(`/leagues/${id}/contestants`),
    enabled: id > 0,
  });

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: { id: number; username: string; tribeName?: string | null; avatarUrl?: string | null } }>('/auth/me'),
    enabled: id > 0,
  });

  const activeContestants = useMemo(
    () => (contestantsData?.contestants ?? []).filter((c) => c.status === 'active'),
    [contestantsData]
  );

  const [draftIds, setDraftIds] = useState<(number | null)[]>([null, null, null]);
  const [predImmunity, setPredImmunity] = useState<number | ''>('');
  const [predBoot, setPredBoot] = useState<number | ''>('');
  const [predIdol, setPredIdol] = useState<number | ''>('');
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  useEffect(() => {
    const d = versusData?.myDraft ?? [];
    setDraftIds([d[0]?.id ?? null, d[1]?.id ?? null, d[2]?.id ?? null]);
    setPredImmunity(versusData?.predictions.immunityContestantId ?? '');
    setPredBoot(versusData?.predictions.bootContestantId ?? '');
    setPredIdol(versusData?.predictions.idolContestantId ?? '');
  }, [versusData?.myDraft, versusData?.predictions]);

  const putDraft = useMutation({
    mutationFn: (contestantIds: number[]) =>
      apiPut(`/versus/${id}/episodes/${episodeId}/draft`, { contestantIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versus', id, episodeId] });
    },
  });

  const putPreds = useMutation({
    mutationFn: (body: {
      immunityContestantId?: number | null;
      bootContestantId?: number | null;
      idolContestantId?: number | null;
    }) => apiPut(`/versus/${id}/episodes/${episodeId}/predictions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versus', id, episodeId] });
    },
  });

  const locked = versusData?.locked ?? false;
  const sortedEps = [...(episodesData?.episodes ?? [])].sort((a, b) => a.episodeNumber - b.episodeNumber);

  const submitDraft = () => {
    const ids = draftIds.filter((x): x is number => x != null);
    if (ids.length !== 3 || new Set(ids).size !== 3) return;
    putDraft.mutate(ids);
  };

  const submitPreds = () => {
    putPreds.mutate({
      immunityContestantId: predImmunity === '' ? null : Number(predImmunity),
      bootContestantId: predBoot === '' ? null : Number(predBoot),
      idolContestantId: predIdol === '' ? null : Number(predIdol),
    });
  };

  if (!leagueId || id <= 0) return <div className="py-8">Invalid league.</div>;
  if (leagueLoading) return <div className="py-8 text-ocean-200">Loading…</div>;
  if (currentLeague && id !== currentLeague.id) return <Navigate to={`/versus/${currentLeague.id}`} replace />;

  const me = meData?.user;
  const maxScore = Math.max(
    versusData?.myBreakdown?.total ?? 0,
    versusData?.opponentBreakdown?.total ?? 0,
    1
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-ocean-950 to-violet-950 pointer-events-none" />
      <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-ember-500/20 via-transparent to-transparent" />
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-ember-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 py-8 px-4 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-ember-400/90 text-xs font-semibold tracking-[0.35em] uppercase mb-1">Weekly showdown</p>
            <h1 className="font-display text-4xl md:text-5xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-white to-violet-200 drop-shadow-lg">
              VERSUS
            </h1>
          </div>
          <Link to="/dashboard" className="text-amber-300/90 hover:text-amber-200 text-sm font-medium">
            ← Dashboard
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 items-center">
          <span className="text-sand-400 text-sm mr-2">Episode</span>
          {sortedEps.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelectedEpisodeId(e.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                episodeId === e.id
                  ? 'bg-gradient-to-r from-ember-600 to-amber-600 text-white shadow-lg shadow-ember-900/50 ring-2 ring-amber-400/40'
                  : 'bg-white/5 text-sand-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              {e.title ?? `Ep ${e.episodeNumber}`}
            </button>
          ))}
        </div>

        {!episodeId || versusLoading || !versusData ? (
          <p className="text-sand-400">Loading arena…</p>
        ) : (
          <>
            {/* Opponent arena */}
            <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 md:p-8 mb-8 shadow-2xl shadow-black/50 ring-1 ring-ember-500/20">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-1 rounded-full bg-gradient-to-r from-ember-600 to-red-700 text-white text-sm font-black tracking-widest shadow-lg">
                VS
              </div>
              <div className="grid md:grid-cols-3 gap-6 items-center mt-4">
                <div className="text-center md:text-left">
                  <p className="text-sand-500 text-xs uppercase tracking-wide mb-2">You</p>
                  {me && (
                    <div className="flex items-center gap-3 justify-center md:justify-start text-white">
                      <UserAvatar username={me.username} avatarUrl={me.avatarUrl} size="lg" />
                      <div className="min-w-0 text-left">
                        <span className="font-bold text-lg block truncate">
                          {me.tribeName?.trim() || me.username}
                        </span>
                        {me.tribeName?.trim() && (
                          <span className="text-sm text-sand-400 truncate block">{me.username}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-center">
                  <div className="w-px h-24 md:w-24 md:h-px bg-gradient-to-b md:bg-gradient-to-r from-transparent via-ember-500/60 to-transparent" />
                </div>
                <div className="text-center md:text-right">
                  <p className="text-sand-500 text-xs uppercase tracking-wide mb-2">Opponent</p>
                  {versusData.matchup?.isBye ? (
                    <p className="text-xl font-bold text-violet-300">Bye week</p>
                  ) : versusData.matchup?.opponent ? (
                    <div className="flex items-center gap-3 justify-center md:justify-end text-white">
                      <div className="min-w-0 text-right order-2 md:order-1">
                        <span className="font-bold text-lg block truncate">
                          {versusData.matchup.opponent.tribeName?.trim() ||
                            versusData.matchup.opponent.username}
                        </span>
                        {versusData.matchup.opponent.tribeName?.trim() && (
                          <span className="text-sm text-sand-400 truncate block">
                            {versusData.matchup.opponent.username}
                          </span>
                        )}
                      </div>
                      <UserAvatar
                        username={versusData.matchup.opponent.username}
                        avatarUrl={versusData.matchup.opponent.avatarUrl}
                        size="lg"
                        className="order-1 md:order-2"
                      />
                    </div>
                  ) : (
                    <p className="text-sand-500">No matchup set yet</p>
                  )}
                </div>
              </div>
              {versusData.locked && !versusData.settled && (
                <p className="mt-4 text-center text-amber-200/80 text-sm">Locked — awaiting results & settlement</p>
              )}
            </div>

            {/* Draft */}
            <section className="mb-8">
              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-ember-500 shadow-[0_0_12px_#f97316]" />
                Draft 3 survivors
              </h2>
              <p className="text-sand-500 text-sm mb-4">Active cast only. Points follow episode outcomes for your picks.</p>
              <div className="grid sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((slot) => {
                  const cid = draftIds[slot];
                  const c = activeContestants.find((x) => x.id === cid);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={locked}
                      onClick={() => !locked && setPickerSlot(slot)}
                      className={`relative rounded-xl border-2 p-4 min-h-[140px] flex flex-col items-center justify-center transition-all ${
                        locked
                          ? 'border-white/10 bg-white/5 opacity-90'
                          : 'border-amber-500/30 bg-gradient-to-b from-white/10 to-transparent hover:border-amber-400/60 hover:shadow-[0_0_24px_rgba(249,115,22,0.15)] cursor-pointer'
                      }`}
                    >
                      {c ? (
                        <>
                          <ContestantAvatar name={c.name} size="lg" />
                          <span className="mt-2 font-semibold text-white text-center">{c.name}</span>
                        </>
                      ) : (
                        <span className="text-sand-500 text-sm">Slot {slot + 1} — tap to pick</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {!locked && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={submitDraft}
                    disabled={putDraft.isPending || draftIds.some((x) => x == null) || new Set(draftIds.filter(Boolean)).size !== 3}
                    className="btn-primary bg-gradient-to-r from-ember-600 to-red-600 border-0 shadow-lg shadow-red-900/40"
                  >
                    {putDraft.isPending ? 'Saving…' : 'Save draft'}
                  </button>
                  {putDraft.isError && (
                    <span className="text-red-400 text-sm">{(putDraft.error as Error)?.message}</span>
                  )}
                </div>
              )}
            </section>

            {/* Predictions */}
            <section className="mb-8">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_12px_#8b5cf6]" />
                Outcome calls
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  {
                    label: 'Individual immunity',
                    sub: `+${versusData.config.versusPredImmunityPts} pts`,
                    value: predImmunity,
                    set: setPredImmunity,
                  },
                  {
                    label: 'Voted out',
                    sub: `+${versusData.config.versusPredBootPts} pts`,
                    value: predBoot,
                    set: setPredBoot,
                  },
                  {
                    label: 'Idol moment',
                    sub: `+${versusData.config.versusPredIdolPts} pts`,
                    value: predIdol,
                    set: setPredIdol,
                  },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="rounded-xl border border-violet-500/20 bg-violet-950/30 p-4 backdrop-blur-sm"
                  >
                    <p className="font-semibold text-violet-100">{f.label}</p>
                    <p className="text-xs text-violet-300/70 mb-2">{f.sub}</p>
                    <select
                      disabled={locked}
                      value={f.value === '' ? '' : String(f.value)}
                      onChange={(e) => f.set(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                      className="w-full rounded-lg bg-black/40 border border-white/15 text-white px-3 py-2 text-sm"
                    >
                      <option value="">Choose…</option>
                      {activeContestants.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!locked && (
                <button
                  type="button"
                  onClick={submitPreds}
                  disabled={putPreds.isPending}
                  className="mt-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 font-medium shadow-lg shadow-violet-900/40"
                >
                  {putPreds.isPending ? 'Saving…' : 'Save predictions'}
                </button>
              )}
            </section>

            {/* Opponent draft reveal */}
            {versusData.locked && versusData.opponentDraft && versusData.matchup?.opponent && (
              <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sand-300 text-sm font-semibold mb-3">Their draft</h3>
                <div className="flex flex-wrap gap-3">
                  {versusData.opponentDraft.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
                      <ContestantAvatar name={c.name} size="sm" />
                      <span className="text-white text-sm">{c.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Settled scoreboard */}
            {versusData.settled && versusData.myBreakdown && (
              <section className="rounded-2xl border border-ember-500/30 bg-gradient-to-b from-ember-950/80 to-black/60 p-6 md:p-8 shadow-[0_0_60px_rgba(234,88,12,0.12)]">
                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Final scores</h2>
                {versusData.outcome && (
                  <p className="text-lg mb-6">
                    <span className="text-sand-400">Result: </span>
                    <span
                      className={
                        versusData.outcome === 'win' || versusData.outcome === 'bye'
                          ? 'text-emerald-400 font-bold'
                          : versusData.outcome === 'tie'
                            ? 'text-amber-300 font-bold'
                            : 'text-red-400 font-bold'
                      }
                    >
                      {versusData.outcome === 'win' && 'Victory'}
                      {versusData.outcome === 'loss' && 'Defeat'}
                      {versusData.outcome === 'tie' && 'Draw — split bonus'}
                      {versusData.outcome === 'bye' && 'Bye — full bonus'}
                    </span>
                    {versusData.winAmount > 0 && (
                      <span className="text-sand-300 ml-2">(+{Number(versusData.winAmount).toFixed(1)} pts)</span>
                    )}
                  </p>
                )}
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <p className="text-sand-500 text-xs uppercase mb-2">You</p>
                    <ScoreBar label="Draft" value={versusData.myBreakdown.draftPoints} max={maxScore} color="from-ocean-500 to-cyan-400" />
                    <ScoreBar label="Predictions" value={versusData.myBreakdown.predictionTotal} max={maxScore} color="from-violet-500 to-fuchsia-400" />
                    <div className="mt-3 text-3xl font-black text-white tabular-nums">{versusData.myBreakdown.total}</div>
                  </div>
                  {versusData.opponentBreakdown && (
                    <div>
                      <p className="text-sand-500 text-xs uppercase mb-2">Opponent</p>
                      <ScoreBar label="Draft" value={versusData.opponentBreakdown.draftPoints} max={maxScore} color="from-slate-500 to-slate-400" />
                      <ScoreBar label="Predictions" value={versusData.opponentBreakdown.predictionTotal} max={maxScore} color="from-slate-600 to-slate-500" />
                      <div className="mt-3 text-3xl font-black text-sand-200 tabular-nums">{versusData.opponentBreakdown.total}</div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {pickerSlot != null && !locked && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setPickerSlot(null)}>
          <div
            className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-lg w-full max-h-[70vh] overflow-y-auto p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white font-semibold mb-3">Pick for slot {pickerSlot + 1}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeContestants
                .filter((c) => !draftIds.includes(c.id) || draftIds[pickerSlot] === c.id)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex flex-col items-center p-2 rounded-xl hover:bg-white/10 border border-transparent hover:border-amber-500/40"
                    onClick={() => {
                      const next = [...draftIds];
                      next[pickerSlot] = c.id;
                      setDraftIds(next);
                      setPickerSlot(null);
                    }}
                  >
                    <ContestantAvatar name={c.name} size="md" />
                    <span className="text-xs text-sand-300 mt-1 text-center">{c.name}</span>
                  </button>
                ))}
            </div>
            <button type="button" className="mt-4 text-sand-400 text-sm hover:text-white" onClick={() => setPickerSlot(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-sand-400 mb-1">
        <span>{label}</span>
        <span>{Number(value).toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-black/50 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
