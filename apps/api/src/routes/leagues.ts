import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { leagues, leagueMembers, contestants, episodes } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export const leaguesRouter = Router();

leaguesRouter.use(requireAuth);

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
