import { db } from '../db/index.js';
import {
  scoringEvents,
  scoringRules,
  contestants,
  versusDraftPicks,
  versusPredictions,
  versusMatchups,
  leagues,
  ledgerTransactions,
  type League,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export type VersusSlot = 'immunity' | 'boot' | 'idol';

export type VersusPredictionMap = {
  immunity?: number | null;
  boot?: number | null;
  idol?: number | null;
};

async function rulesByAction(leagueId: number): Promise<Map<string, number>> {
  const rules = await db.select().from(scoringRules).where(eq(scoringRules.leagueId, leagueId));
  const m = new Map<string, number>();
  for (const r of rules) m.set(r.actionType, Number(r.points));
  return m;
}

/** Sum scoring rule points for episode events whose contestant is in picks. */
export async function computeVersusDraftScore(
  leagueId: number,
  episodeId: number,
  contestantIds: number[]
): Promise<number> {
  if (contestantIds.length === 0) return 0;
  const set = new Set(contestantIds);
  const rules = await rulesByAction(leagueId);
  const events = await db
    .select()
    .from(scoringEvents)
    .where(and(eq(scoringEvents.leagueId, leagueId), eq(scoringEvents.episodeId, episodeId)));
  let total = 0;
  for (const ev of events) {
    if (ev.contestantId == null || !set.has(ev.contestantId)) continue;
    total += rules.get(ev.actionType) ?? 0;
  }
  return total;
}

export async function computeVersusPredictionBonuses(
  league: Pick<
    League,
    | 'id'
    | 'versusPredImmunityPts'
    | 'versusPredBootPts'
    | 'versusPredIdolPts'
  >,
  episodeId: number,
  preds: VersusPredictionMap
): Promise<{ immunity: number; boot: number; idol: number }> {
  const immunityPts = league.versusPredImmunityPts ?? 5;
  const bootPts = league.versusPredBootPts ?? 5;
  const idolPts = league.versusPredIdolPts ?? 5;

  const events = await db
    .select()
    .from(scoringEvents)
    .where(and(eq(scoringEvents.leagueId, league.id), eq(scoringEvents.episodeId, episodeId)));

  let immunity = 0;
  if (preds.immunity != null) {
    const ok = events.some(
      (e) => e.actionType === 'individual_immunity' && e.contestantId === preds.immunity
    );
    if (ok) immunity = immunityPts;
  }

  let boot = 0;
  if (preds.boot != null) {
    const [c] = await db
      .select()
      .from(contestants)
      .where(and(eq(contestants.id, preds.boot), eq(contestants.leagueId, league.id)));
    const bySchema =
      c != null && c.eliminatedEpisodeId === episodeId && c.status === 'eliminated';
    const byEvent = events.some(
      (e) => e.actionType === 'eliminated' && e.contestantId === preds.boot
    );
    if (bySchema || byEvent) boot = bootPts;
  }

  let idol = 0;
  if (preds.idol != null) {
    const ok = events.some(
      (e) =>
        (e.actionType === 'idol_found' || e.actionType === 'idol_played') &&
        e.contestantId === preds.idol
    );
    if (ok) idol = idolPts;
  }

  return { immunity, boot, idol };
}

export async function loadUserPicks(
  leagueId: number,
  episodeId: number,
  userId: number
): Promise<number[]> {
  const rows = await db
    .select({ contestantId: versusDraftPicks.contestantId })
    .from(versusDraftPicks)
    .where(
      and(
        eq(versusDraftPicks.leagueId, leagueId),
        eq(versusDraftPicks.episodeId, episodeId),
        eq(versusDraftPicks.userId, userId)
      )
    );
  return rows.map((r) => r.contestantId);
}

export async function loadUserPredictions(
  leagueId: number,
  episodeId: number,
  userId: number
): Promise<VersusPredictionMap> {
  const rows = await db
    .select()
    .from(versusPredictions)
    .where(
      and(
        eq(versusPredictions.leagueId, leagueId),
        eq(versusPredictions.episodeId, episodeId),
        eq(versusPredictions.userId, userId)
      )
    );
  const m: VersusPredictionMap = {};
  for (const r of rows) {
    if (r.slot === 'immunity') m.immunity = r.contestantId;
    if (r.slot === 'boot') m.boot = r.contestantId;
    if (r.slot === 'idol') m.idol = r.contestantId;
  }
  return m;
}

export type VersusUserScoreBreakdown = {
  userId: number;
  draftPoints: number;
  immunityBonus: number;
  bootBonus: number;
  idolBonus: number;
  predictionTotal: number;
  total: number;
};

export async function computeUserVersusBreakdown(
  league: League,
  episodeId: number,
  userId: number
): Promise<VersusUserScoreBreakdown> {
  const picks = await loadUserPicks(league.id, episodeId, userId);
  const draftPoints = await computeVersusDraftScore(league.id, episodeId, picks);
  const preds = await loadUserPredictions(league.id, episodeId, userId);
  const b = await computeVersusPredictionBonuses(league, episodeId, preds);
  const predictionTotal = b.immunity + b.boot + b.idol;
  return {
    userId,
    draftPoints,
    immunityBonus: b.immunity,
    bootBonus: b.boot,
    idolBonus: b.idol,
    predictionTotal,
    total: draftPoints + predictionTotal,
  };
}

/** Find matchup row where user is user1 or user2 */
export async function findMatchupForUser(
  leagueId: number,
  episodeId: number,
  userId: number
): Promise<(typeof versusMatchups.$inferSelect) | null> {
  const [as1] = await db
    .select()
    .from(versusMatchups)
    .where(
      and(
        eq(versusMatchups.leagueId, leagueId),
        eq(versusMatchups.episodeId, episodeId),
        eq(versusMatchups.user1Id, userId)
      )
    );
  if (as1) return as1;
  const [as2] = await db
    .select()
    .from(versusMatchups)
    .where(
      and(
        eq(versusMatchups.leagueId, leagueId),
        eq(versusMatchups.episodeId, episodeId),
        eq(versusMatchups.user2Id, userId)
      )
    );
  return as2 ?? null;
}

export type VersusSettleRow = {
  matchupId: number;
  user1Id: number;
  user2Id: number | null;
  score1: number;
  score2: number | null;
  amountUser1: number;
  amountUser2: number;
};

/**
 * Idempotent: clears versus_win ledger for this episode, then awards win bonuses.
 * Tie: split versusWinPoints equally between both players.
 */
export async function settleVersusEpisode(
  leagueId: number,
  episodeId: number,
  dryRun: boolean
): Promise<{ rows: VersusSettleRow[] }> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error('League not found');
  const winPts = league.versusWinPoints ?? 10;
  const matchRows = await db
    .select()
    .from(versusMatchups)
    .where(and(eq(versusMatchups.leagueId, leagueId), eq(versusMatchups.episodeId, episodeId)));

  if (!dryRun) {
    await db.delete(ledgerTransactions).where(
      and(
        eq(ledgerTransactions.leagueId, leagueId),
        eq(ledgerTransactions.reason, 'versus_win'),
        eq(ledgerTransactions.referenceType, 'episode'),
        eq(ledgerTransactions.referenceId, episodeId)
      )
    );
  }

  const rows: VersusSettleRow[] = [];

  for (const m of matchRows) {
    const b1 = await computeUserVersusBreakdown(league, episodeId, m.user1Id);
    if (m.user2Id == null) {
      rows.push({
        matchupId: m.id,
        user1Id: m.user1Id,
        user2Id: null,
        score1: b1.total,
        score2: null,
        amountUser1: winPts,
        amountUser2: 0,
      });
      if (!dryRun && winPts > 0) {
        await db.insert(ledgerTransactions).values({
          leagueId,
          userId: m.user1Id,
          amount: winPts,
          reason: 'versus_win',
          referenceType: 'episode',
          referenceId: episodeId,
        });
      }
      continue;
    }
    const b2 = await computeUserVersusBreakdown(league, episodeId, m.user2Id);
    let amountUser1 = 0;
    let amountUser2 = 0;
    if (b1.total > b2.total) {
      amountUser1 = winPts;
    } else if (b2.total > b1.total) {
      amountUser2 = winPts;
    } else {
      const half = winPts / 2;
      amountUser1 = half;
      amountUser2 = half;
    }
    rows.push({
      matchupId: m.id,
      user1Id: m.user1Id,
      user2Id: m.user2Id,
      score1: b1.total,
      score2: b2.total,
      amountUser1,
      amountUser2,
    });
    if (!dryRun) {
      if (amountUser1 > 0) {
        await db.insert(ledgerTransactions).values({
          leagueId,
          userId: m.user1Id,
          amount: amountUser1,
          reason: 'versus_win',
          referenceType: 'episode',
          referenceId: episodeId,
        });
      }
      if (amountUser2 > 0) {
        await db.insert(ledgerTransactions).values({
          leagueId,
          userId: m.user2Id,
          amount: amountUser2,
          reason: 'versus_win',
          referenceType: 'episode',
          referenceId: episodeId,
        });
      }
    }
  }

  return { rows };
}
