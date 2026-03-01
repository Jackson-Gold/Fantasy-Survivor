import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  teams,
  contestants,
  leagueMembers,
  episodes,
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { isLocked } from '../lib/lock.js';
import { logAudit } from '../lib/audit.js';

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

const minRoster = 2;
const maxRoster = 3;

async function getCurrentLockForLeague(leagueId: number): Promise<Date | null> {
  const [ep] = await db
    .select({ lockAt: episodes.lockAt })
    .from(episodes)
    .where(eq(episodes.leagueId, leagueId))
    .orderBy(desc(episodes.airDate))
    .limit(1);
  return ep?.lockAt ?? null;
}

async function ensureLeagueMember(userId: number, leagueId: number): Promise<boolean> {
  const [m] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return !!m;
}

teamsRouter.get('/:leagueId', async (req: Request, res: Response) => {
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
  const roster = await db
    .select({
      id: teams.id,
      contestantId: teams.contestantId,
      name: contestants.name,
      status: contestants.status,
    })
    .from(teams)
    .innerJoin(contestants, eq(teams.contestantId, contestants.id))
    .where(and(eq(teams.leagueId, leagueId), eq(teams.userId, req.user!.id)));
  const lockAt = await getCurrentLockForLeague(leagueId);
  const locked = lockAt ? isLocked(lockAt) : false;
  res.json({ roster, locked, lockAt: lockAt?.toISOString() ?? null });
});

teamsRouter.get('/:leagueId/roster/:userId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const targetUserId = parseInt(req.params.userId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(targetUserId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const roster = await db
    .select({
      id: teams.id,
      contestantId: teams.contestantId,
      name: contestants.name,
    })
    .from(teams)
    .innerJoin(contestants, eq(teams.contestantId, contestants.id))
    .where(and(eq(teams.leagueId, leagueId), eq(teams.userId, targetUserId)));
  res.json({ roster });
});

const addBody = z.object({ contestantId: z.number().int().positive() });
teamsRouter.post('/:leagueId/add', requireAdmin, async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const parsed = addBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const lockAt = await getCurrentLockForLeague(leagueId);
  if (lockAt && isLocked(lockAt)) {
    await logAudit({
      actorUserId: req.user!.id,
      actionType: 'attempt_modify_locked',
      entityType: 'team',
      metadataJson: { reason: 'episode_locked', leagueId, operation: 'add' },
    });
    res.status(403).json({ error: 'Roster is locked for this week' });
    return;
  }
  const current = await db
    .select()
    .from(teams)
    .where(and(eq(teams.leagueId, leagueId), eq(teams.userId, req.user!.id)));
  if (current.length >= maxRoster) {
    res.status(400).json({ error: `Roster already has maximum ${maxRoster} contestants` });
    return;
  }
  const [cont] = await db
    .select()
    .from(contestants)
    .where(and(eq(contestants.id, parsed.data.contestantId), eq(contestants.leagueId, leagueId)));
  if (!cont) {
    res.status(404).json({ error: 'Contestant not found' });
    return;
  }
  try {
    await db.insert(teams).values({
      leagueId,
      userId: req.user!.id,
      contestantId: parsed.data.contestantId,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      res.status(400).json({ error: 'Contestant is already on a roster in this league' });
      return;
    }
    throw e;
  }
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'team.add_contestant',
    entityType: 'team',
    metadataJson: { leagueId, contestantId: parsed.data.contestantId },
  });
  res.status(201).json({ ok: true });
});

teamsRouter.delete('/:leagueId/:contestantId', requireAdmin, async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const contestantId = parseInt(req.params.contestantId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(contestantId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const lockAt = await getCurrentLockForLeague(leagueId);
  if (lockAt && isLocked(lockAt)) {
    await logAudit({
      actorUserId: req.user!.id,
      actionType: 'attempt_modify_locked',
      entityType: 'team',
      metadataJson: { reason: 'episode_locked', leagueId, contestantId, operation: 'remove' },
    });
    res.status(403).json({ error: 'Roster is locked for this week' });
    return;
  }
  const current = await db
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.leagueId, leagueId),
        eq(teams.userId, req.user!.id),
        eq(teams.contestantId, contestantId)
      )
  );
  if (current.length === 0) {
    res.status(404).json({ error: 'Contestant not on your roster' });
    return;
  }
  const rosterCount = await db
    .select()
    .from(teams)
    .where(and(eq(teams.leagueId, leagueId), eq(teams.userId, req.user!.id)));
  if (rosterCount.length <= minRoster) {
    res.status(400).json({ error: `Roster must have at least ${minRoster} contestants` });
    return;
  }
  await db
    .delete(teams)
    .where(
      and(
        eq(teams.leagueId, leagueId),
        eq(teams.userId, req.user!.id),
        eq(teams.contestantId, contestantId)
      )
  );
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'team.remove_contestant',
    entityType: 'team',
    metadataJson: { leagueId, contestantId },
  });
  res.json({ ok: true });
});
