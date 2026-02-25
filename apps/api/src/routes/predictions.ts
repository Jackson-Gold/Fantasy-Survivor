import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  votePredictions,
  winnerPicks,
  episodes,
  leagueMembers,
  contestants,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { isLocked } from '../lib/lock.js';
import { logAudit } from '../lib/audit.js';

export const predictionsRouter = Router();
predictionsRouter.use(requireAuth);

const defaultVoteTotal = 10;

async function ensureLeagueMember(userId: number, leagueId: number): Promise<boolean> {
  const [m] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return !!m;
}

predictionsRouter.get('/winner/:leagueId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [pick] = await db
    .select({
      id: winnerPicks.id,
      contestantId: winnerPicks.contestantId,
      pickedAt: winnerPicks.pickedAt,
      name: contestants.name,
    })
    .from(winnerPicks)
    .innerJoin(contestants, eq(winnerPicks.contestantId, contestants.id))
    .where(and(eq(winnerPicks.leagueId, leagueId), eq(winnerPicks.userId, req.user!.id)));
  const lockAt = await getNextLockForLeague(leagueId);
  const locked = lockAt ? isLocked(lockAt) : false;
  res.json({ pick: pick ?? null, locked, lockAt: lockAt?.toISOString() ?? null });
});

async function getNextLockForLeague(leagueId: number): Promise<Date | null> {
  const now = new Date();
  const all = await db
    .select({ lockAt: episodes.lockAt })
    .from(episodes)
    .where(eq(episodes.leagueId, leagueId));
  const future = all.filter((e) => e.lockAt && new Date(e.lockAt) > now);
  future.sort((a, b) => new Date(a.lockAt!).getTime() - new Date(b.lockAt!).getTime());
  return future[0]?.lockAt ?? null;
}

predictionsRouter.post('/winner/:leagueId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const body = z.object({ contestantId: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', details: body.error.flatten() });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const lockAt = await getNextLockForLeague(leagueId);
  if (lockAt && isLocked(lockAt)) {
    res.status(403).json({ error: 'Winner pick is locked' });
    return;
  }
  const [cont] = await db
    .select()
    .from(contestants)
    .where(and(eq(contestants.id, body.data.contestantId), eq(contestants.leagueId, leagueId)));
  if (!cont) {
    res.status(404).json({ error: 'Contestant not found' });
    return;
  }
  await db.delete(winnerPicks).where(and(eq(winnerPicks.leagueId, leagueId), eq(winnerPicks.userId, req.user!.id)));
  await db.insert(winnerPicks).values({
    leagueId,
    userId: req.user!.id,
    contestantId: body.data.contestantId,
  });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'winner_pick.create',
    entityType: 'winner_pick',
    metadataJson: { leagueId, contestantId: body.data.contestantId },
  });
  res.json({ ok: true });
});

predictionsRouter.get('/votes/:leagueId/:episodeId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
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
  const rows = await db
    .select({
      contestantId: votePredictions.contestantId,
      votes: votePredictions.votes,
      name: contestants.name,
    })
    .from(votePredictions)
    .innerJoin(contestants, eq(votePredictions.contestantId, contestants.id))
    .where(
      and(
        eq(votePredictions.leagueId, leagueId),
        eq(votePredictions.userId, req.user!.id),
        eq(votePredictions.episodeId, episodeId)
      )
    );
  res.json({
    episodeId,
    locked,
    lockAt: ep.lockAt.toISOString(),
    allocations: rows,
    voteTotal: defaultVoteTotal,
  });
});

const votesBody = z.object({
  allocations: z.array(z.object({ contestantId: z.number().int().positive(), votes: z.number().int().min(0) })),
});
predictionsRouter.put('/votes/:leagueId/:episodeId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const parsed = votesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
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
    res.status(403).json({ error: 'Predictions are locked for this episode' });
    return;
  }
  const total = parsed.data.allocations.reduce((s, a) => s + a.votes, 0);
  if (total !== defaultVoteTotal) {
    res.status(400).json({ error: `Total votes must equal ${defaultVoteTotal}` });
    return;
  }
  for (const a of parsed.data.allocations) {
    const [c] = await db
      .select()
      .from(contestants)
      .where(and(eq(contestants.id, a.contestantId), eq(contestants.leagueId, leagueId)));
    if (!c) {
      res.status(400).json({ error: `Contestant ${a.contestantId} not in league` });
      return;
    }
  }
  await db.delete(votePredictions).where(
    and(
      eq(votePredictions.leagueId, leagueId),
      eq(votePredictions.userId, req.user!.id),
      eq(votePredictions.episodeId, episodeId)
    )
  );
  const now = new Date();
  for (const a of parsed.data.allocations) {
    if (a.votes === 0) continue;
    await db.insert(votePredictions).values({
      leagueId,
      userId: req.user!.id,
      episodeId,
      contestantId: a.contestantId,
      votes: a.votes,
      updatedAt: now,
    });
  }
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'vote_predictions.update',
    entityType: 'vote_predictions',
    metadataJson: { leagueId, episodeId },
  });
  res.json({ ok: true });
});
