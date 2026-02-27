import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { leagues, leagueMembers, contestants, episodes, teams, winnerPicks, votePredictions } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

export const leaguesRouter = Router();

leaguesRouter.use(requireAuth);

leaguesRouter.post('/join', async (req: Request, res: Response) => {
  const body = z.object({ inviteCode: z.string().min(1).max(32) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', details: body.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, body.data.inviteCode.trim()));
  if (!league) {
    res.status(404).json({ error: 'Invalid or expired invite code' });
    return;
  }
  const [existing] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId)));
  if (existing) {
    res.status(403).json({ error: 'You are already in this league' });
    return;
  }
  await db.insert(leagueMembers).values({ leagueId: league.id, userId });
  await logAudit({
    actorUserId: userId,
    actionType: 'league.member_add',
    entityType: 'league_members',
    metadataJson: { leagueId: league.id, inviteCode: true },
  });
  res.status(201).json({
    id: league.id,
    name: league.name,
    seasonName: league.seasonName,
  });
});

leaguesRouter.delete('/:leagueId/members/me', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const userId = req.user!.id;
  const [member] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  if (!member) {
    res.status(404).json({ error: 'Not a member of this league' });
    return;
  }
  await db.delete(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.userId, userId)));
  await db.delete(winnerPicks).where(and(eq(winnerPicks.leagueId, leagueId), eq(winnerPicks.userId, userId)));
  await db.delete(votePredictions).where(and(eq(votePredictions.leagueId, leagueId), eq(votePredictions.userId, userId)));
  await db.delete(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  await logAudit({
    actorUserId: userId,
    actionType: 'league.member_leave',
    entityType: 'league_members',
    metadataJson: { leagueId },
  });
  res.json({ ok: true });
});

leaguesRouter.get('/:id/contestants', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const userId = req.user!.id;
  const [member] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)));
  if (!member) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const list = await db.select().from(contestants).where(eq(contestants.leagueId, id));
  res.json({ contestants: list });
});

leaguesRouter.get('/:id/episodes', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const userId = req.user!.id;
  const [member] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)));
  if (!member) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const list = await db.select().from(episodes).where(eq(episodes.leagueId, id)).orderBy(asc(episodes.episodeNumber));
  res.json({ episodes: list });
});

leaguesRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const list = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      seasonName: leagues.seasonName,
    })
    .from(leagues)
    .innerJoin(leagueMembers, eq(leagues.id, leagueMembers.leagueId))
    .where(eq(leagueMembers.userId, userId));
  res.json({ leagues: list });
});

leaguesRouter.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const userId = req.user!.id;
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      seasonName: leagues.seasonName,
    })
    .from(leagues)
    .innerJoin(leagueMembers, eq(leagues.id, leagueMembers.leagueId))
    .where(and(eq(leagues.id, id), eq(leagueMembers.userId, userId)));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  res.json(league);
});
