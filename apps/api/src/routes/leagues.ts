import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { leagues, leagueMembers, contestants, episodes, teams, winnerPicks, votePredictions, auditLog, users, scoringEvents } from '../db/schema.js';
import { eq, and, asc, desc, inArray, sql } from 'drizzle-orm';
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
  const [anyLeague] = await db
    .select()
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));
  if (anyLeague) {
    res.status(403).json({ error: 'You can only be in one league' });
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

leaguesRouter.get('/:id/members', async (req: Request, res: Response) => {
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
  const list = await db
    .select({ id: users.id, username: users.username })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id));
  res.json({ members: list });
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

const FEED_ACTION_TYPES = ['trade.propose', 'trade.accept', 'trade.reject', 'scoring_event.create', 'contestant.eliminated'] as const;

leaguesRouter.get('/:id/feed', async (req: Request, res: Response) => {
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
  const limit = Math.min(Math.max(5, parseInt(String(req.query.limit), 10) || 10), 10);
  const rows = await db
    .select({
      id: auditLog.id,
      timestamp: auditLog.timestamp,
      actionType: auditLog.actionType,
      entityType: auditLog.entityType,
      metadataJson: auditLog.metadataJson,
      afterJson: auditLog.afterJson,
      actorUsername: users.username,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(
      and(
        inArray(auditLog.actionType, [...FEED_ACTION_TYPES]),
        sql`(COALESCE((${auditLog.metadataJson}->>'leagueId')::int, (${auditLog.afterJson}->>'leagueId')::int, 0) = ${id})`
      )
    )
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
  const feed = rows.map((r) => {
    const meta = (r.metadataJson || r.afterJson) as Record<string, unknown> | null;
    let message = '';
    switch (r.actionType) {
      case 'trade.propose':
        message = r.actorUsername ? `${r.actorUsername} proposed a trade` : 'A trade was proposed';
        break;
      case 'trade.accept':
        message = r.actorUsername ? `${r.actorUsername} accepted a trade` : 'A trade was accepted';
        break;
      case 'trade.reject':
        message = r.actorUsername ? `${r.actorUsername} rejected a trade` : 'A trade was rejected';
        break;
      case 'scoring_event.create':
        message = meta?.episodeId ? `Points applied for episode` : 'Points updated';
        break;
      case 'contestant.eliminated':
        message = meta?.contestantName
          ? `${String(meta.contestantName)} was voted out`
          : 'A contestant was eliminated';
        if (meta?.episodeNumber != null) message += ` in Episode ${meta.episodeNumber}`;
        break;
      case 'ledger.credit':
        message = 'Points credited';
        break;
      default:
        message = r.actionType.replace(/[._]/g, ' ');
    }
    return {
      id: r.id,
      timestamp: r.timestamp,
      actionType: r.actionType,
      message,
      actorUsername: r.actorUsername ?? null,
    };
  });
  res.json({ feed });
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

// Single-league paradigm: there is one league. Every authenticated user is in it.
// Return the first league and ensure the user is a member (add if not).
leaguesRouter.get('/current', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const [firstLeague] = await db
    .select({ id: leagues.id, name: leagues.name, seasonName: leagues.seasonName })
    .from(leagues)
    .orderBy(asc(leagues.id))
    .limit(1);
  if (!firstLeague) {
    res.status(404).json({ error: 'No league' });
    return;
  }
  const [existing] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, firstLeague.id), eq(leagueMembers.userId, userId)));
  if (!existing) {
    await db.insert(leagueMembers).values({ leagueId: firstLeague.id, userId });
    await logAudit({
      actorUserId: userId,
      actionType: 'league.member_add',
      entityType: 'league_members',
      metadataJson: { leagueId: firstLeague.id, autoAdd: true },
    });
  }
  res.json({ league: firstLeague });
});

leaguesRouter.get('/:id/stats', async (req: Request, res: Response) => {
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
  const contestantList = await db.select().from(contestants).where(eq(contestants.leagueId, id));
  const events = await db
    .select({ contestantId: scoringEvents.contestantId, actionType: scoringEvents.actionType })
    .from(scoringEvents)
    .where(eq(scoringEvents.leagueId, id));
  const statsByContestant: Record<
    number,
    { individualImmunityWins: number; tribeRewardWins: number; tribeImmunityWins: number; idolFound: number; idolPlayed: number; advantageFound: number; advantagePlayed: number; survivedTribal: number; eliminated: number }
  > = {};
  for (const c of contestantList) {
    statsByContestant[c.id] = {
      individualImmunityWins: 0,
      tribeRewardWins: 0,
      tribeImmunityWins: 0,
      idolFound: 0,
      idolPlayed: 0,
      advantageFound: 0,
      advantagePlayed: 0,
      survivedTribal: 0,
      eliminated: 0,
    };
  }
  for (const ev of events) {
    if (ev.contestantId == null) continue;
    const s = statsByContestant[ev.contestantId];
    if (!s) continue;
    switch (ev.actionType) {
      case 'individual_immunity':
        s.individualImmunityWins++;
        break;
      case 'tribe_reward_win':
        s.tribeRewardWins++;
        break;
      case 'tribe_immunity_win':
        s.tribeImmunityWins++;
        break;
      case 'idol_found':
        s.idolFound++;
        break;
      case 'idol_played':
        s.idolPlayed++;
        break;
      case 'advantage_found':
        s.advantageFound++;
        break;
      case 'advantage_played':
        s.advantagePlayed++;
        break;
      case 'survived_tribal':
        s.survivedTribal++;
        break;
      case 'eliminated':
        s.eliminated++;
        break;
      default:
        break;
    }
  }
  const contestantsWithStats = contestantList.map((c) => ({
    contestantId: c.id,
    name: c.name,
    status: c.status,
    ...statsByContestant[c.id],
  }));
  res.json({ contestants: contestantsWithStats });
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
      voteTotal: leagues.voteTotal,
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
