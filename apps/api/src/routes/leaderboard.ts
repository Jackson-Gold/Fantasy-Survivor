import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { leagueMembers, users, ledgerTransactions } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
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
      total: sql<number>`COALESCE(SUM(${ledgerTransactions.amount}), 0)::real`.as('total'),
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .leftJoin(ledgerTransactions, and(eq(ledgerTransactions.leagueId, leagueId), eq(ledgerTransactions.userId, users.id)))
    .where(eq(leagueMembers.leagueId, leagueId))
    .groupBy(users.id, users.username, users.avatarUrl)
    .orderBy(desc(sql`COALESCE(SUM(${ledgerTransactions.amount}), 0)`));
  res.json({ leaderboard: rows });
});

type BreakdownRow = {
  userId: number;
  username: string;
  avatarUrl: string | null;
  scoring_event: number;
  vote_prediction: number;
  winner_pick: number;
  trade: number;
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
      scoring_event: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'scoring_event' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('scoring_event'),
      vote_prediction: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'vote_prediction' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('vote_prediction'),
      winner_pick: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'winner_pick' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('winner_pick'),
      trade: sql<number>`COALESCE(SUM(CASE WHEN ${ledgerTransactions.reason} = 'trade' THEN ${ledgerTransactions.amount} ELSE 0 END), 0)::real`.as('trade'),
      total: sql<number>`COALESCE(SUM(${ledgerTransactions.amount}), 0)::real`.as('total'),
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .leftJoin(ledgerTransactions, and(eq(ledgerTransactions.leagueId, leagueId), eq(ledgerTransactions.userId, users.id)))
    .where(eq(leagueMembers.leagueId, leagueId))
    .groupBy(users.id, users.username, users.avatarUrl)
    .orderBy(desc(sql`COALESCE(SUM(${ledgerTransactions.amount}), 0)`));
  res.json({ leaderboard: rows as BreakdownRow[] });
});
