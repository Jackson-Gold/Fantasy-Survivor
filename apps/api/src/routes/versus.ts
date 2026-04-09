import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  leagueMembers,
  episodes,
  contestants,
  versusDraftPicks,
  versusPredictions,
  users,
  ledgerTransactions,
  leagues,
} from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { isLocked } from '../lib/lock.js';
import {
  findMatchupForUser,
  loadUserPicks,
  loadUserPredictions,
  computeUserVersusBreakdown,
} from '../lib/versus.js';

export const versusRouter = Router();
versusRouter.use(requireAuth);

async function ensureLeagueMember(userId: number, leagueId: number): Promise<boolean> {
  const [m] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return !!m;
}

versusRouter.get('/:leagueId/episodes/:episodeId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const uid = req.user!.id;
  if (!(await ensureLeagueMember(uid, leagueId))) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [ep] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  const locked = isLocked(ep.lockAt);
  const matchup = await findMatchupForUser(leagueId, episodeId, uid);

  let opponentId: number | null = null;
  let isBye = false;
  if (matchup) {
    if (matchup.user1Id === uid) {
      opponentId = matchup.user2Id ?? null;
      isBye = matchup.user2Id == null;
    } else if (matchup.user2Id === uid) {
      opponentId = matchup.user1Id;
    }
  }

  let opponent: {
    userId: number;
    username: string;
    tribeName: string | null;
    avatarUrl: string | null;
  } | null = null;
  if (opponentId != null) {
    const [u] = await db
      .select({
        userId: users.id,
        username: users.username,
        tribeName: users.tribeName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, opponentId));
    if (u) opponent = u;
  }

  const myPickIds = await loadUserPicks(leagueId, episodeId, uid);
  const myPreds = await loadUserPredictions(leagueId, episodeId, uid);

  const contestantNames = async (ids: number[]) => {
    if (ids.length === 0) return [] as { id: number; name: string }[];
    const rows = await db
      .select({ id: contestants.id, name: contestants.name })
      .from(contestants)
      .where(and(eq(contestants.leagueId, leagueId), inArray(contestants.id, ids)));
    const m = new Map(rows.map((c) => [c.id, c.name]));
    return ids.map((id) => ({ id, name: m.get(id) ?? `#${id}` }));
  };

  const myDraft = await contestantNames(myPickIds);

  let opponentDraft: { id: number; name: string }[] | null = null;
  if (locked && opponentId != null) {
    const oppIds = await loadUserPicks(leagueId, episodeId, opponentId);
    opponentDraft = await contestantNames(oppIds);
  }

  const [settledRow] = await db
    .select({ n: ledgerTransactions.id })
    .from(ledgerTransactions)
    .where(
      and(
        eq(ledgerTransactions.leagueId, leagueId),
        eq(ledgerTransactions.reason, 'versus_win'),
        eq(ledgerTransactions.referenceType, 'episode'),
        eq(ledgerTransactions.referenceId, episodeId)
      )
    )
    .limit(1);
  const settled = !!settledRow;

  let myBreakdown = null as Awaited<ReturnType<typeof computeUserVersusBreakdown>> | null;
  let opponentBreakdown = null as Awaited<ReturnType<typeof computeUserVersusBreakdown>> | null;
  let outcome: 'win' | 'loss' | 'tie' | 'bye' | null = null;
  let winAmount = 0;

  if (settled) {
    myBreakdown = await computeUserVersusBreakdown(league, episodeId, uid);
    if (opponentId != null) {
      opponentBreakdown = await computeUserVersusBreakdown(league, episodeId, opponentId);
    }
    if (isBye) {
      outcome = 'bye';
      winAmount = league.versusWinPoints ?? 10;
    } else if (opponentBreakdown) {
      if (myBreakdown.total > opponentBreakdown.total) outcome = 'win';
      else if (myBreakdown.total < opponentBreakdown.total) outcome = 'loss';
      else outcome = 'tie';
    }
    const [myLedger] = await db
      .select({ amount: ledgerTransactions.amount })
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.leagueId, leagueId),
          eq(ledgerTransactions.userId, uid),
          eq(ledgerTransactions.reason, 'versus_win'),
          eq(ledgerTransactions.referenceType, 'episode'),
          eq(ledgerTransactions.referenceId, episodeId)
        )
      )
      .limit(1);
    winAmount = myLedger ? Number(myLedger.amount) : 0;
  }

  res.json({
    episode: {
      id: ep.id,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      lockAt: ep.lockAt.toISOString(),
    },
    locked,
    config: {
      versusWinPoints: league.versusWinPoints ?? 10,
      versusPredImmunityPts: league.versusPredImmunityPts ?? 5,
      versusPredBootPts: league.versusPredBootPts ?? 5,
      versusPredIdolPts: league.versusPredIdolPts ?? 5,
    },
    matchup: matchup
      ? {
          id: matchup.id,
          isBye,
          opponent,
        }
      : null,
    myDraft,
    opponentDraft,
    predictions: {
      immunityContestantId: myPreds.immunity ?? null,
      bootContestantId: myPreds.boot ?? null,
      idolContestantId: myPreds.idol ?? null,
    },
    settled,
    myBreakdown,
    opponentBreakdown,
    outcome,
    winAmount,
  });
});

const draftBody = z.object({
  contestantIds: z.array(z.number().int().positive()).length(3),
});

versusRouter.put('/:leagueId/episodes/:episodeId/draft', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const parsed = draftBody.safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId) || !parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }
  const uid = req.user!.id;
  if (!(await ensureLeagueMember(uid, leagueId))) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [ep] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  if (isLocked(ep.lockAt)) {
    res.status(403).json({ error: 'Versus draft is locked for this episode' });
    return;
  }
  const ids = parsed.data.contestantIds;
  if (new Set(ids).size !== 3) {
    res.status(400).json({ error: 'Contestants must be distinct' });
    return;
  }
  for (const cid of ids) {
    const [c] = await db
      .select()
      .from(contestants)
      .where(and(eq(contestants.id, cid), eq(contestants.leagueId, leagueId)));
    if (!c || c.status !== 'active') {
      res.status(400).json({ error: 'Invalid or inactive contestant' });
      return;
    }
  }
  await db
    .delete(versusDraftPicks)
    .where(
      and(
        eq(versusDraftPicks.leagueId, leagueId),
        eq(versusDraftPicks.episodeId, episodeId),
        eq(versusDraftPicks.userId, uid)
      )
    );
  const now = new Date();
  for (const contestantId of ids) {
    await db.insert(versusDraftPicks).values({
      leagueId,
      episodeId,
      userId: uid,
      contestantId,
      updatedAt: now,
    });
  }
  res.json({ ok: true });
});

const predBody = z.object({
  immunityContestantId: z.number().int().positive().optional().nullable(),
  bootContestantId: z.number().int().positive().optional().nullable(),
  idolContestantId: z.number().int().positive().optional().nullable(),
});

versusRouter.put('/:leagueId/episodes/:episodeId/predictions', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const parsed = predBody.safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId) || !parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }
  const uid = req.user!.id;
  if (!(await ensureLeagueMember(uid, leagueId))) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [ep] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  if (isLocked(ep.lockAt)) {
    res.status(403).json({ error: 'Versus predictions are locked for this episode' });
    return;
  }

  const slots: { slot: 'immunity' | 'boot' | 'idol'; contestantId: number | null | undefined }[] = [
    { slot: 'immunity', contestantId: parsed.data.immunityContestantId },
    { slot: 'boot', contestantId: parsed.data.bootContestantId },
    { slot: 'idol', contestantId: parsed.data.idolContestantId },
  ];

  await db
    .delete(versusPredictions)
    .where(
      and(
        eq(versusPredictions.leagueId, leagueId),
        eq(versusPredictions.episodeId, episodeId),
        eq(versusPredictions.userId, uid)
      )
    );

  const now = new Date();
  for (const { slot, contestantId } of slots) {
    if (contestantId == null) continue;
    const [c] = await db
      .select()
      .from(contestants)
      .where(and(eq(contestants.id, contestantId), eq(contestants.leagueId, leagueId)));
    if (!c || c.status !== 'active') {
      res.status(400).json({ error: `Invalid contestant for ${slot}` });
      return;
    }
    await db.insert(versusPredictions).values({
      leagueId,
      episodeId,
      userId: uid,
      slot,
      contestantId,
      updatedAt: now,
    });
  }
  res.json({ ok: true });
});
