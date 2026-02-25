import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  trades,
  tradeItems,
  teams,
  leagueMembers,
  episodes,
  ledgerTransactions,
} from '../db/schema.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { isLocked } from '../lib/lock.js';
import { logAudit } from '../lib/audit.js';

export const tradesRouter = Router();
tradesRouter.use(requireAuth);

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

async function ensureLeagueMember(userId: number, leagueId: number): Promise<boolean> {
  const [m] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return !!m;
}

const itemSchema = z.object({
  side: z.enum(['from_proposer', 'from_acceptor']),
  type: z.enum(['contestant', 'points']),
  contestantId: z.number().int().positive().optional(),
  points: z.number().int().optional(),
});
const proposeBody = z.object({
  leagueId: z.number().int().positive(),
  acceptorId: z.number().int().positive(),
  note: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

tradesRouter.post('/propose', async (req: Request, res: Response) => {
  const parsed = proposeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { leagueId, acceptorId, note, items } = parsed.data;
  if (acceptorId === req.user!.id) {
    res.status(400).json({ error: 'Cannot propose trade to yourself' });
    return;
  }
  const ok = await ensureLeagueMember(req.user!.id, leagueId);
  if (!ok) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const acceptorOk = await ensureLeagueMember(acceptorId, leagueId);
  if (!acceptorOk) {
    res.status(400).json({ error: 'Acceptor is not in this league' });
    return;
  }
  const lockAt = await getNextLockForLeague(leagueId);
  if (lockAt && isLocked(lockAt)) {
    res.status(403).json({ error: 'Trades are locked for this week' });
    return;
  }
  for (const it of items) {
    if (it.type === 'contestant' && !it.contestantId) {
      res.status(400).json({ error: 'Contestant item must have contestantId' });
      return;
    }
    if (it.type === 'points' && (it.points === undefined || it.points < 0)) {
      res.status(400).json({ error: 'Points item must have non-negative points' });
      return;
    }
  }
  const [trade] = await db
    .insert(trades)
    .values({
      leagueId,
      proposerId: req.user!.id,
      acceptorId,
      status: 'proposed',
      note: note ?? null,
    })
    .returning();
  if (!trade) {
    res.status(500).json({ error: 'Failed to create trade' });
    return;
  }
  for (const it of items) {
    await db.insert(tradeItems).values({
      tradeId: trade.id,
      side: it.side,
      type: it.type,
      contestantId: it.type === 'contestant' ? it.contestantId : null,
      points: it.type === 'points' ? it.points : null,
    });
  }
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'trade.propose',
    entityType: 'trade',
    entityId: trade.id,
    metadataJson: { leagueId, acceptorId },
  });
  res.status(201).json({ trade: { id: trade.id, status: trade.status } });
});

tradesRouter.get('/:leagueId', async (req: Request, res: Response) => {
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
  const list = await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.leagueId, leagueId),
        or(eq(trades.proposerId, req.user!.id), eq(trades.acceptorId, req.user!.id))
      )
    )
    .orderBy(desc(trades.createdAt));
  const withItems = await Promise.all(
    list.map(async (t) => {
      const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, t.id));
      return { ...t, items };
    })
  );
  res.json({ trades: withItems });
});

tradesRouter.post('/:tradeId/accept', async (req: Request, res: Response) => {
  const tradeId = parseInt(req.params.tradeId, 10);
  if (Number.isNaN(tradeId)) {
    res.status(400).json({ error: 'Invalid trade id' });
    return;
  }
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId));
  if (!trade) {
    res.status(404).json({ error: 'Trade not found' });
    return;
  }
  if (trade.acceptorId !== req.user!.id) {
    res.status(403).json({ error: 'Only the acceptor can accept' });
    return;
  }
  if (trade.status !== 'proposed') {
    res.status(400).json({ error: 'Trade is not in proposed state' });
    return;
  }
  const lockAt = await getNextLockForLeague(trade.leagueId);
  if (lockAt && isLocked(lockAt)) {
    res.status(403).json({ error: 'Trades are locked' });
    return;
  }
  const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, trade.id));
  // Execute atomically: swap contestants, transfer points via ledger
  await db.transaction(async (tx) => {
    // Swap roster spots: from_proposer items go to acceptor, from_acceptor go to proposer
    for (const it of items) {
      if (it.type !== 'contestant' || !it.contestantId) continue;
      const fromUser = it.side === 'from_proposer' ? trade.proposerId : trade.acceptorId;
      const toUser = it.side === 'from_proposer' ? trade.acceptorId : trade.proposerId;
      await tx.delete(teams).where(
        and(
          eq(teams.leagueId, trade.leagueId),
          eq(teams.userId, fromUser),
          eq(teams.contestantId, it.contestantId)
        )
      );
      await tx.insert(teams).values({
        leagueId: trade.leagueId,
        userId: toUser,
        contestantId: it.contestantId,
      });
    }
    for (const it of items) {
      if (it.type !== 'points' || it.points == null) continue;
      const fromUser = it.side === 'from_proposer' ? trade.proposerId : trade.acceptorId;
      const toUser = it.side === 'from_proposer' ? trade.acceptorId : trade.proposerId;
      await tx.insert(ledgerTransactions).values({
        leagueId: trade.leagueId,
        userId: fromUser,
        amount: -it.points,
        reason: 'trade',
        referenceType: 'trade',
        referenceId: trade.id,
      });
      await tx.insert(ledgerTransactions).values({
        leagueId: trade.leagueId,
        userId: toUser,
        amount: it.points,
        reason: 'trade',
        referenceType: 'trade',
        referenceId: trade.id,
      });
    }
    await tx.update(trades).set({ status: 'accepted', updatedAt: new Date() }).where(eq(trades.id, trade.id));
  });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'trade.accept',
    entityType: 'trade',
    entityId: trade.id,
  });
  res.json({ ok: true });
});

tradesRouter.post('/:tradeId/reject', async (req: Request, res: Response) => {
  const tradeId = parseInt(req.params.tradeId, 10);
  if (Number.isNaN(tradeId)) {
    res.status(400).json({ error: 'Invalid trade id' });
    return;
  }
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId));
  if (!trade) {
    res.status(404).json({ error: 'Trade not found' });
    return;
  }
  if (trade.acceptorId !== req.user!.id) {
    res.status(403).json({ error: 'Only the acceptor can reject' });
    return;
  }
  if (trade.status !== 'proposed') {
    res.status(400).json({ error: 'Trade is not in proposed state' });
    return;
  }
  await db.update(trades).set({ status: 'rejected', updatedAt: new Date() }).where(eq(trades.id, trade.id));
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'trade.reject',
    entityType: 'trade',
    entityId: trade.id,
  });
  res.json({ ok: true });
});
