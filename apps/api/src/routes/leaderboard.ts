import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { leagueMembers, users, ledgerTransactions, scoringEvents, episodes } from '../db/schema.js';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

async function ensureLeagueMember(userId: number, leagueId: number): Promise<boolean> {
  const [m] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return !!m;
}

leaderboardRouter.get('/:leagueId', async (req: Request, res: Response) => {
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
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      tribeName: users.tribeName,
      total: sql<number>`COALESCE(SUM(${ledgerTransactions.amount}), 0)::real`.as('total'),
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .leftJoin(ledgerTransactions, and(eq(ledgerTransactions.leagueId, leagueId), eq(ledgerTransactions.userId, users.id)))
    .where(eq(leagueMembers.leagueId, leagueId))
    .groupBy(users.id, users.username, users.avatarUrl, users.tribeName)
    .orderBy(desc(sql`COALESCE(SUM(${ledgerTransactions.amount}), 0)`));
  res.json({ leaderboard: rows });
});

type BreakdownRow = {
  userId: number;
  username: string;
  avatarUrl: string | null;
  tribeName: string | null;
  scoring_event: number;
  vote_prediction: number;
  winner_pick: number;
  trade: number;
  adjustment: number;
  total: number;
};

leaderboardRouter.get('/:leagueId/breakdown', async (req: Request, res: Response) => {
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
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      tribeName: users.tribeName,
      scoring_event: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'scoring_event' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('scoring_event'),
      vote_prediction: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'vote_prediction' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('vote_prediction'),
      winner_pick: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'winner_pick' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('winner_pick'),
      trade: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'trade' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('trade'),
      adjustment: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'adjustment' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('adjustment'),
      total: sql<number>`COALESCE(SUM(${ledgerTransactions.amount}), 0)::real`.as('total'),
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .leftJoin(ledgerTransactions, and(eq(ledgerTransactions.leagueId, leagueId), eq(ledgerTransactions.userId, users.id)))
    .where(eq(leagueMembers.leagueId, leagueId))
    .groupBy(users.id, users.username, users.avatarUrl, users.tribeName)
    .orderBy(desc(sql`COALESCE(SUM(${ledgerTransactions.amount}), 0)`));
  res.json({ leaderboard: rows as BreakdownRow[] });
});

type EpisodeStanding = { episodeId: number; episodeNumber: number; title: string | null; pointsByUser: { userId: number; username: string; tribeName: string | null; points: number }[] };

leaderboardRouter.get('/:leagueId/by-episode', async (req: Request, res: Response) => {
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
  const episodeList = await db
    .select({ id: episodes.id, episodeNumber: episodes.episodeNumber, title: episodes.title })
    .from(episodes)
    .where(eq(episodes.leagueId, leagueId))
    .orderBy(asc(episodes.episodeNumber));
  const members = await db
    .select({ userId: users.id, username: users.username, tribeName: users.tribeName })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, leagueId));
  const pointsByUserByEpisode: Record<number, Record<number, number>> = {};
  for (const m of members) {
    pointsByUserByEpisode[m.userId] = {};
  }
  const votePoints = await db
    .select({
      userId: ledgerTransactions.userId,
      episodeId: ledgerTransactions.referenceId,
      amount: sql<number>`SUM(${ledgerTransactions.amount})::real`.as('amount'),
    })
    .from(ledgerTransactions)
    .where(
      and(
        eq(ledgerTransactions.leagueId, leagueId),
        eq(ledgerTransactions.reason, 'vote_prediction'),
        eq(ledgerTransactions.referenceType, 'episode')
      )
    )
    .groupBy(ledgerTransactions.userId, ledgerTransactions.referenceId);
  for (const row of votePoints) {
    const epId = row.episodeId;
    if (epId != null && pointsByUserByEpisode[row.userId]) {
      pointsByUserByEpisode[row.userId][epId] = (pointsByUserByEpisode[row.userId][epId] ?? 0) + Number(row.amount);
    }
  }
  const scoringRows = await db
    .select({
      userId: ledgerTransactions.userId,
      episodeId: scoringEvents.episodeId,
      amount: sql<number>`SUM(${ledgerTransactions.amount})::real`.as('amount'),
    })
    .from(ledgerTransactions)
    .innerJoin(scoringEvents, and(eq(ledgerTransactions.referenceId, scoringEvents.id), eq(ledgerTransactions.referenceType, 'scoring_event')))
    .where(and(eq(ledgerTransactions.leagueId, leagueId), eq(ledgerTransactions.reason, 'scoring_event')))
    .groupBy(ledgerTransactions.userId, scoringEvents.episodeId);
  for (const row of scoringRows) {
    if (pointsByUserByEpisode[row.userId]) {
      pointsByUserByEpisode[row.userId][row.episodeId] = (pointsByUserByEpisode[row.userId][row.episodeId] ?? 0) + Number(row.amount);
    }
  }
  const result: EpisodeStanding[] = episodeList.map((ep) => ({
    episodeId: ep.id,
    episodeNumber: ep.episodeNumber,
    title: ep.title,
    pointsByUser: members
      .map((m) => ({ userId: m.userId, username: m.username, tribeName: m.tribeName ?? null, points: pointsByUserByEpisode[m.userId]?.[ep.id] ?? 0 }))
      .sort((a, b) => b.points - a.points),
  }));
  res.json({ episodes: result });
});
