import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  users,
  leagues,
  leagueMembers,
  contestants,
  episodes,
  scoringRules,
  scoringEvents,
  ledgerTransactions,
  votePredictions,
  auditLog,
  teams,
  winnerPicks,
  trades,
  tradeItems,
} from '../db/schema.js';
import { eq, and, or, desc, asc, inArray } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
import { getLockTimeForWeek } from '../lib/lock.js';
import { logAudit } from '../lib/audit.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// ---------- Users ----------
const createUserBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8),
  role: z.enum(['admin', 'player']).optional(),
});
adminRouter.post('/users', async (req: Request, res: Response) => {
  const parsed = createUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const hash = await argon2.hash(parsed.data.password);
  const role = parsed.data.role ?? 'player';
  try {
    const [user] = await db
      .insert(users)
      .values({
        username: parsed.data.username,
        passwordHash: hash,
        role,
        mustChangePassword: false,
      })
      .returning();
    await logAudit({
      actorUserId: req.user!.id,
      actionType: 'user.create',
      entityType: 'user',
      entityId: user.id,
      afterJson: { username: user.username, role: user.role },
    });
    if (role === 'player') {
      const [firstLeague] = await db.select().from(leagues).orderBy(asc(leagues.id)).limit(1);
      if (firstLeague) {
        await db.insert(leagueMembers).values({ leagueId: firstLeague.id, userId: user.id }).onConflictDoNothing();
      }
    }
    res.status(201).json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }
    throw e;
  }
});

adminRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const body = z.object({ password: z.string().min(8) }).safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const hash = await argon2.hash(body.data.password);
  await db.update(users).set({ passwordHash: hash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, id));
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'user.password_change',
    entityType: 'user',
    entityId: id,
    metadataJson: { resetByAdmin: true },
  });
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const adminCount = await db.select().from(users).where(eq(users.role, 'admin'));
  if (target.role === 'admin' && adminCount.length <= 1) {
    res.status(400).json({ error: 'Cannot delete the last admin' });
    return;
  }
  const userTrades = await db.select({ id: trades.id }).from(trades).where(or(eq(trades.proposerId, id), eq(trades.acceptorId, id)));
  const tradeIds = userTrades.map((t) => t.id);
  await db.transaction(async (tx) => {
    if (tradeIds.length > 0) {
      await tx.delete(tradeItems).where(inArray(tradeItems.tradeId, tradeIds));
      await tx.delete(trades).where(inArray(trades.id, tradeIds));
    }
    await tx.delete(leagueMembers).where(eq(leagueMembers.userId, id));
    await tx.delete(teams).where(eq(teams.userId, id));
    await tx.delete(winnerPicks).where(eq(winnerPicks.userId, id));
    await tx.delete(votePredictions).where(eq(votePredictions.userId, id));
    await tx.delete(ledgerTransactions).where(eq(ledgerTransactions.userId, id));
    await tx.delete(users).where(eq(users.id, id));
  });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'user.delete',
    entityType: 'user',
    entityId: id,
    metadataJson: { username: target.username },
  });
  res.json({ ok: true });
});

adminRouter.get('/users', async (_req: Request, res: Response) => {
  const list = await db.select({ id: users.id, username: users.username, tribeName: users.tribeName, role: users.role, mustChangePassword: users.mustChangePassword }).from(users);
  res.json({ users: list });
});

const patchUserBody = z.object({ username: z.string().min(1).max(64).optional(), role: z.enum(['admin', 'player']).optional() });
adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const body = patchUserBody.safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request', details: body.success ? undefined : body.error.flatten() });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const updates: { username?: string; role?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (body.data.username !== undefined) updates.username = body.data.username;
  if (body.data.role !== undefined) updates.role = body.data.role;
  if (Object.keys(updates).length <= 1) {
    res.json(user);
    return;
  }
  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.user.update',
    entityType: 'user',
    entityId: id,
    metadataJson: updates,
  });
  res.json(updated);
});

// ---------- Leagues ----------
adminRouter.post('/leagues', async (req: Request, res: Response) => {
  const body = z.object({ name: z.string().min(1), seasonName: z.string().optional() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', details: body.error.flatten() });
    return;
  }
  let code = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select().from(leagues).where(eq(leagues.inviteCode, code));
    if (!existing) break;
    code = generateInviteCode();
  }
  const [league] = await db
    .insert(leagues)
    .values({ ...body.data, inviteCode: code })
    .returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'league.create',
    entityType: 'league',
    entityId: league.id,
    afterJson: { ...body.data, inviteCode: code },
  });
  res.status(201).json(league);
});

const patchLeagueBody = z.object({
  name: z.string().min(1).optional(),
  seasonName: z.string().optional(),
  inviteCode: z.string().max(32).optional(),
  regenerateInviteCode: z.boolean().optional(),
  voteTotal: z.number().int().min(1).max(100).optional(),
});
adminRouter.patch('/leagues/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const body = patchLeagueBody.safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request', details: body.success ? undefined : body.error.flatten() });
    return;
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const updates: { name?: string; seasonName?: string; inviteCode?: string; voteTotal?: number } = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.seasonName !== undefined) updates.seasonName = body.data.seasonName;
  if (body.data.voteTotal !== undefined) updates.voteTotal = body.data.voteTotal;
  if (body.data.regenerateInviteCode || body.data.inviteCode !== undefined) {
    updates.inviteCode = body.data.inviteCode ?? generateInviteCode();
    if (!body.data.inviteCode) {
      let code = updates.inviteCode!;
      for (let i = 0; i < 5; i++) {
        const [existing] = await db.select().from(leagues).where(eq(leagues.inviteCode, code));
        if (!existing || existing.id === id) break;
        code = generateInviteCode();
        updates.inviteCode = code;
      }
    }
  }
  if (Object.keys(updates).length === 0) {
    res.json(league);
    return;
  }
  const [updated] = await db.update(leagues).set(updates).where(eq(leagues.id, id)).returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'league.update',
    entityType: 'league',
    entityId: id,
    metadataJson: updates,
  });
  res.json(updated);
});

adminRouter.post('/leagues/:id/members', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.id, 10);
  const body = z.object({ userId: z.number().int().positive() }).safeParse(req.body);
  if (Number.isNaN(leagueId) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  await db.insert(leagueMembers).values({ leagueId, userId: body.data.userId });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'league.member_add',
    entityType: 'league_members',
    metadataJson: { leagueId, userId: body.data.userId },
  });
  res.status(201).json({ ok: true });
});

adminRouter.get('/leagues', async (_req: Request, res: Response) => {
  const list = await db.select().from(leagues);
  res.json({ leagues: list });
});

adminRouter.get('/leagues/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  res.json(league);
});

// ---------- Admin: winner picks (list + set for any user) ----------
adminRouter.get('/leagues/:leagueId/winner-picks', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const members = await db.select({ userId: leagueMembers.userId, username: users.username, tribeName: users.tribeName }).from(leagueMembers).innerJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, leagueId));
  const picks = await db.select({ userId: winnerPicks.userId, contestantId: winnerPicks.contestantId, name: contestants.name }).from(winnerPicks).innerJoin(contestants, eq(winnerPicks.contestantId, contestants.id)).where(eq(winnerPicks.leagueId, leagueId));
  const pickByUser = new Map(picks.map((p) => [p.userId, { contestantId: p.contestantId, name: p.name }]));
  const list = members.map((m) => ({ userId: m.userId, username: m.username, tribeName: m.tribeName ?? null, pick: pickByUser.get(m.userId) ?? null }));
  res.json({ winnerPicks: list });
});

const putWinnerPickBody = z.object({ userId: z.number().int().positive(), contestantId: z.number().int().positive() });
adminRouter.put('/leagues/:leagueId/winner-picks', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const body = putWinnerPickBody.safeParse(req.body);
  if (Number.isNaN(leagueId) || !body.success) {
    res.status(400).json({ error: 'Invalid request', details: body.success ? undefined : body.error.flatten() });
    return;
  }
  const [member] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, body.data.userId)));
  if (!member) {
    res.status(404).json({ error: 'User not in league' });
    return;
  }
  const [cont] = await db.select().from(contestants).where(and(eq(contestants.id, body.data.contestantId), eq(contestants.leagueId, leagueId)));
  if (!cont) {
    res.status(400).json({ error: 'Contestant not in league' });
    return;
  }
  await db.delete(winnerPicks).where(and(eq(winnerPicks.leagueId, leagueId), eq(winnerPicks.userId, body.data.userId)));
  await db.insert(winnerPicks).values({ leagueId, userId: body.data.userId, contestantId: body.data.contestantId });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.winner_pick.set',
    entityType: 'winner_pick',
    metadataJson: { leagueId, userId: body.data.userId, contestantId: body.data.contestantId },
  });
  res.json({ ok: true });
});

// ---------- Admin: vote predictions (list + set for any user) ----------
const defaultVoteTotal = 10;
adminRouter.get('/leagues/:leagueId/episodes/:episodeId/votes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const userIdParam = req.query.userId ? parseInt(String(req.query.userId), 10) : null;
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const [ep] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  const members = await db.select({ userId: leagueMembers.userId, username: users.username, tribeName: users.tribeName }).from(leagueMembers).innerJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, leagueId));
  const predictions = await db
    .select({ userId: votePredictions.userId, contestantId: votePredictions.contestantId, name: contestants.name, votes: votePredictions.votes })
    .from(votePredictions)
    .innerJoin(contestants, eq(votePredictions.contestantId, contestants.id))
    .where(and(eq(votePredictions.leagueId, leagueId), eq(votePredictions.episodeId, episodeId)));
  if (userIdParam && !Number.isNaN(userIdParam)) {
    const userRows = predictions.filter((r) => r.userId === userIdParam);
    const allocations = userRows.map((r) => ({ contestantId: r.contestantId, name: r.name, votes: r.votes }));
    res.json({ episodeId, userId: userIdParam, allocations });
    return;
  }
  const byUser = new Map<number, { contestantId: number; name: string; votes: number }[]>();
  for (const r of predictions) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push({ contestantId: r.contestantId, name: r.name, votes: r.votes });
  }
  const list = members.map((m) => ({ userId: m.userId, username: m.username, tribeName: m.tribeName ?? null, allocations: byUser.get(m.userId) ?? [] }));
  res.json({ episodeId, votesByUser: list });
});

const putVotesBody = z.object({
  userId: z.coerce.number().int().positive(),
  allocations: z.array(z.object({
    contestantId: z.coerce.number().int().positive(),
    votes: z.coerce.number().int().min(0),
  })),
});
adminRouter.put('/leagues/:leagueId/episodes/:episodeId/votes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const body = putVotesBody.safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId) || !body.success) {
    res.status(400).json({ error: 'Invalid request', details: body.success ? undefined : body.error.flatten() });
    return;
  }
  const [league] = await db.select({ voteTotal: leagues.voteTotal }).from(leagues).where(eq(leagues.id, leagueId));
  const voteTotal = league?.voteTotal ?? defaultVoteTotal;
  const total = body.data.allocations.reduce((s, a) => s + a.votes, 0);
  if (total !== voteTotal) {
    res.status(400).json({ error: `Total votes must equal ${voteTotal}` });
    return;
  }
  const [member] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, body.data.userId)));
  if (!member) {
    res.status(404).json({ error: 'User not in league' });
    return;
  }
  const [ep] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  for (const a of body.data.allocations) {
    const [c] = await db.select().from(contestants).where(and(eq(contestants.id, a.contestantId), eq(contestants.leagueId, leagueId)));
    if (!c) {
      res.status(400).json({ error: `Contestant ${a.contestantId} not in league` });
      return;
    }
  }
  await db.delete(votePredictions).where(and(eq(votePredictions.leagueId, leagueId), eq(votePredictions.userId, body.data.userId), eq(votePredictions.episodeId, episodeId)));
  const now = new Date();
  for (const a of body.data.allocations) {
    if (a.votes === 0) continue;
    await db.insert(votePredictions).values({
      leagueId,
      userId: body.data.userId,
      episodeId,
      contestantId: a.contestantId,
      votes: a.votes,
      updatedAt: now,
    });
  }
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.vote_predictions.set',
    entityType: 'vote_predictions',
    metadataJson: { leagueId, episodeId, userId: body.data.userId },
  });
  res.json({ ok: true });
});

// ---------- Admin: rosters (list + add/remove for any user) ----------
adminRouter.get('/leagues/:leagueId/teams', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const members = await db.select({ userId: leagueMembers.userId, username: users.username, tribeName: users.tribeName }).from(leagueMembers).innerJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, leagueId));
  const rosterRows = await db
    .select({ userId: teams.userId, contestantId: teams.contestantId, name: contestants.name })
    .from(teams)
    .innerJoin(contestants, eq(teams.contestantId, contestants.id))
    .where(eq(teams.leagueId, leagueId));
  const byUser = new Map<number, { contestantId: number; name: string }[]>();
  for (const r of rosterRows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push({ contestantId: r.contestantId, name: r.name });
  }
  const list = members.map((m) => ({ userId: m.userId, username: m.username, tribeName: m.tribeName ?? null, roster: byUser.get(m.userId) ?? [] }));
  res.json({ teams: list });
});

adminRouter.post('/leagues/:leagueId/teams/:userId/add', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const targetUserId = parseInt(req.params.userId, 10);
  const body = z.object({ contestantId: z.number().int().positive() }).safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(targetUserId) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const [member] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, targetUserId)));
  if (!member) {
    res.status(404).json({ error: 'User not in league' });
    return;
  }
  const [cont] = await db.select().from(contestants).where(and(eq(contestants.id, body.data.contestantId), eq(contestants.leagueId, leagueId)));
  if (!cont) {
    res.status(400).json({ error: 'Contestant not in league' });
    return;
  }
  const current = await db.select().from(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.userId, targetUserId)));
  if (current.length >= 3) {
    res.status(400).json({ error: 'Roster already has 3 contestants' });
    return;
  }
  const taken = await db.select().from(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.contestantId, body.data.contestantId)));
  if (taken.length > 0) {
    res.status(400).json({ error: 'Contestant already on a roster in this league' });
    return;
  }
  await db.insert(teams).values({ leagueId, userId: targetUserId, contestantId: body.data.contestantId });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.roster.add',
    entityType: 'team',
    metadataJson: { leagueId, userId: targetUserId, contestantId: body.data.contestantId },
  });
  res.status(201).json({ ok: true });
});

adminRouter.delete('/leagues/:leagueId/teams/:userId/contestants/:contestantId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const targetUserId = parseInt(req.params.userId, 10);
  const contestantId = parseInt(req.params.contestantId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(targetUserId) || Number.isNaN(contestantId)) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const current = await db.select().from(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.userId, targetUserId), eq(teams.contestantId, contestantId)));
  if (current.length === 0) {
    res.status(404).json({ error: 'Contestant not on user roster' });
    return;
  }
  const rosterCount = await db.select().from(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.userId, targetUserId)));
  if (rosterCount.length <= 2) {
    res.status(400).json({ error: 'Roster must have at least 2 contestants' });
    return;
  }
  await db.delete(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.userId, targetUserId), eq(teams.contestantId, contestantId)));
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.roster.remove',
    entityType: 'team',
    metadataJson: { leagueId, userId: targetUserId, contestantId },
  });
  res.json({ ok: true });
});

// ---------- Admin: trades (list + cancel) ----------
adminRouter.get('/leagues/:leagueId/trades', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const list = await db.select().from(trades).where(eq(trades.leagueId, leagueId)).orderBy(desc(trades.createdAt));
  const withItems = await Promise.all(list.map(async (t) => {
    const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, t.id));
    return { ...t, items };
  }));
  res.json({ trades: withItems });
});

adminRouter.patch('/trades/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const body = z.object({ status: z.enum(['canceled', 'proposed', 'pending', 'accepted', 'rejected']).optional() }).safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const [trade] = await db.select().from(trades).where(eq(trades.id, id));
  if (!trade) {
    res.status(404).json({ error: 'Trade not found' });
    return;
  }
  const newStatus = body.data.status ?? trade.status;
  await db.update(trades).set({ status: newStatus, updatedAt: new Date() }).where(eq(trades.id, id));
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.trade.cancel',
    entityType: 'trade',
    entityId: id,
    metadataJson: { leagueId: trade.leagueId, previousStatus: trade.status, newStatus },
  });
  res.json({ ok: true });
});

// ---------- Contestants ----------
adminRouter.post('/leagues/:leagueId/contestants', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const body = z.object({ name: z.string().min(1), status: z.enum(['active', 'eliminated', 'injured']).optional(), eliminatedEpisodeId: z.number().optional() }).safeParse(req.body);
  if (Number.isNaN(leagueId) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const [c] = await db
    .insert(contestants)
    .values({
      leagueId,
      name: body.data.name,
      status: body.data.status ?? 'active',
      eliminatedEpisodeId: body.data.eliminatedEpisodeId ?? null,
    })
    .returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'contestant.create',
    entityType: 'contestant',
    entityId: c.id,
    afterJson: { name: c.name, status: c.status },
  });
  res.status(201).json(c);
});

adminRouter.get('/leagues/:leagueId/contestants', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const list = await db.select().from(contestants).where(eq(contestants.leagueId, leagueId));
  res.json({ contestants: list });
});

adminRouter.patch('/contestants/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const body = z.object({ status: z.enum(['active', 'eliminated', 'injured']).optional(), eliminatedEpisodeId: z.number().int().positive().nullable().optional() }).safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const updates: { status?: string; eliminatedEpisodeId?: number | null } = { ...body.data };
  if (body.data.status === 'active' && body.data.eliminatedEpisodeId === undefined) {
    updates.eliminatedEpisodeId = null;
  }
  await db.update(contestants).set(updates).where(eq(contestants.id, id));
  res.json({ ok: true });
});

// ---------- Episodes ----------
adminRouter.post('/leagues/:leagueId/episodes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const body = z.object({
    episodeNumber: z.number().int().positive(),
    title: z.string().optional(),
    airDate: z.string().datetime().or(z.string().min(1)),
  }).safeParse(req.body);
  if (Number.isNaN(leagueId) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const airDate = new Date(body.data.airDate);
  const lockAt = getLockTimeForWeek(airDate);
  const [ep] = await db
    .insert(episodes)
    .values({
      leagueId,
      episodeNumber: body.data.episodeNumber,
      title: body.data.title ?? null,
      airDate,
      lockAt,
    })
    .returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'episode.create',
    entityType: 'episode',
    entityId: ep.id,
    afterJson: { episodeNumber: ep.episodeNumber, airDate: ep.airDate, lockAt: ep.lockAt },
  });
  res.status(201).json(ep);
});

adminRouter.get('/leagues/:leagueId/episodes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const list = await db.select().from(episodes).where(eq(episodes.leagueId, leagueId)).orderBy(episodes.episodeNumber);
  res.json({ episodes: list });
});

adminRouter.delete('/leagues/:leagueId/episodes/:episodeId', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const [ep] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  await db.transaction(async (tx) => {
    const evRows = await tx.select({ id: scoringEvents.id }).from(scoringEvents).where(eq(scoringEvents.episodeId, episodeId));
    const evIds = evRows.map((r) => r.id);
    if (evIds.length > 0) {
      await tx.delete(ledgerTransactions).where(
        and(
          eq(ledgerTransactions.leagueId, leagueId),
          eq(ledgerTransactions.reason, 'scoring_event'),
          inArray(ledgerTransactions.referenceId, evIds)
        )
      );
    }
    await tx.delete(ledgerTransactions).where(
      and(
        eq(ledgerTransactions.leagueId, leagueId),
        eq(ledgerTransactions.reason, 'vote_prediction'),
        eq(ledgerTransactions.referenceType, 'episode'),
        eq(ledgerTransactions.referenceId, episodeId)
      )
    );
    await tx.delete(votePredictions).where(eq(votePredictions.episodeId, episodeId));
    await tx.delete(scoringEvents).where(eq(scoringEvents.episodeId, episodeId));
    await tx.delete(episodes).where(eq(episodes.id, episodeId));
  });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'episode.delete',
    entityType: 'episode',
    entityId: episodeId,
    metadataJson: { leagueId, episodeNumber: ep.episodeNumber },
  });
  res.json({ ok: true });
});

// ---------- Scoring rules ----------
const defaultActions = [
  { actionType: 'tribe_reward_win', points: 5 },
  { actionType: 'tribe_immunity_win', points: 5 },
  { actionType: 'individual_immunity', points: 10 },
  { actionType: 'idol_found', points: 5 },
  { actionType: 'idol_played', points: 10 },
  { actionType: 'survived_tribal', points: 2 },
  { actionType: 'eliminated', points: -5 },
  { actionType: 'vote_correct', points: 3 },
  { actionType: 'winner_placement_1', points: 50 },
  { actionType: 'winner_placement_2', points: 25 },
  { actionType: 'winner_placement_3', points: 15 },
];
adminRouter.post('/leagues/:leagueId/scoring-rules/defaults', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  for (const a of defaultActions) {
    try {
      await db.insert(scoringRules).values({ leagueId, actionType: a.actionType, points: a.points });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code !== '23505') throw e;
    }
  }
  const list = await db.select().from(scoringRules).where(eq(scoringRules.leagueId, leagueId));
  res.json({ scoringRules: list });
});

adminRouter.get('/leagues/:leagueId/scoring-rules', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const list = await db.select().from(scoringRules).where(eq(scoringRules.leagueId, leagueId));
  res.json({ scoringRules: list });
});

const addScoringRuleBody = z.object({
  actionType: z.string().min(1).max(64),
  points: z.number(),
});
adminRouter.post('/leagues/:leagueId/scoring-rules', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const parsed = addScoringRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  try {
    await db.insert(scoringRules).values({
      leagueId,
      actionType: parsed.data.actionType,
      points: parsed.data.points,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
      res.status(400).json({ error: 'Scoring rule for this action type already exists' });
      return;
    }
    throw e;
  }
  const list = await db.select().from(scoringRules).where(eq(scoringRules.leagueId, leagueId));
  res.status(201).json({ scoringRules: list });
});

adminRouter.put('/scoring-rules/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const body = z.object({ points: z.number() }).safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  await db.update(scoringRules).set({ points: body.data.points }).where(eq(scoringRules.id, id));
  res.json({ ok: true });
});

// ---------- Episode outcomes (get, clear) and scoring events (create, delete) ----------
adminRouter.get('/leagues/:leagueId/episodes/:episodeId/outcomes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const [ep] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  const events = await db
    .select({
      id: scoringEvents.id,
      actionType: scoringEvents.actionType,
      contestantId: scoringEvents.contestantId,
      name: contestants.name,
    })
    .from(scoringEvents)
    .leftJoin(contestants, and(eq(scoringEvents.contestantId, contestants.id), eq(contestants.leagueId, leagueId)))
    .where(and(eq(scoringEvents.leagueId, leagueId), eq(scoringEvents.episodeId, episodeId)));
  const votedOutContestantIds = events
    .filter((e) => e.actionType === 'eliminated' && e.contestantId != null)
    .map((e) => e.contestantId as number);
  res.json({
    events: events.map((e) => ({ id: e.id, actionType: e.actionType, contestantId: e.contestantId, contestantName: e.name })),
    votedOutContestantIds,
  });
});

adminRouter.delete('/leagues/:leagueId/episodes/:episodeId/outcomes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const [ep] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(404).json({ error: 'Episode not found' });
    return;
  }
  await db.transaction(async (tx) => {
    const evRows = await tx.select({ id: scoringEvents.id }).from(scoringEvents).where(eq(scoringEvents.episodeId, episodeId));
    const evIds = evRows.map((r) => r.id);
    if (evIds.length > 0) {
      await tx.delete(ledgerTransactions).where(
        and(
          eq(ledgerTransactions.leagueId, leagueId),
          eq(ledgerTransactions.reason, 'scoring_event'),
          inArray(ledgerTransactions.referenceId, evIds)
        )
      );
    }
    await tx.delete(ledgerTransactions).where(
      and(
        eq(ledgerTransactions.leagueId, leagueId),
        eq(ledgerTransactions.reason, 'vote_prediction'),
        eq(ledgerTransactions.referenceType, 'episode'),
        eq(ledgerTransactions.referenceId, episodeId)
      )
    );
    await tx.delete(votePredictions).where(eq(votePredictions.episodeId, episodeId));
    await tx.delete(scoringEvents).where(eq(scoringEvents.episodeId, episodeId));
  });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.episode_outcomes.clear',
    entityType: 'episode',
    entityId: episodeId,
    metadataJson: { leagueId },
  });
  res.json({ ok: true });
});

adminRouter.delete('/scoring-events/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const [ev] = await db.select().from(scoringEvents).where(eq(scoringEvents.id, id));
  if (!ev) {
    res.status(404).json({ error: 'Scoring event not found' });
    return;
  }
  await db.delete(ledgerTransactions).where(
    and(eq(ledgerTransactions.reason, 'scoring_event'), eq(ledgerTransactions.referenceType, 'scoring_event'), eq(ledgerTransactions.referenceId, id))
  );
  await db.delete(scoringEvents).where(eq(scoringEvents.id, id));
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'scoring_event.delete',
    entityType: 'scoring_event',
    entityId: id,
    metadataJson: { leagueId: ev.leagueId },
  });
  res.json({ ok: true });
});

// ---------- Scoring events (admin enters outcomes) ----------
adminRouter.post('/scoring-events', async (req: Request, res: Response) => {
  const body = z.object({
    leagueId: z.number().int().positive(),
    episodeId: z.number().int().positive(),
    actionType: z.string().min(1),
    contestantId: z.number().int().positive().optional(),
    metadata: z.record(z.unknown()).optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', details: body.error.flatten() });
    return;
  }
  const [rule] = await db
    .select()
    .from(scoringRules)
    .where(and(eq(scoringRules.leagueId, body.data.leagueId), eq(scoringRules.actionType, body.data.actionType)));
  const points = rule?.points ?? 0;
  const [ev] = await db
    .insert(scoringEvents)
    .values({
      leagueId: body.data.leagueId,
      episodeId: body.data.episodeId,
      actionType: body.data.actionType,
      contestantId: body.data.contestantId ?? null,
      metadata: body.data.metadata ?? null,
      createdByUserId: req.user!.id,
    })
    .returning();
  if (body.data.contestantId && points !== 0) {
    const [team] = await db.select().from(teams).where(
      and(
        eq(teams.leagueId, body.data.leagueId),
        eq(teams.contestantId, body.data.contestantId)
      )
    );
    if (team) {
      await db.insert(ledgerTransactions).values({
        leagueId: body.data.leagueId,
        userId: team.userId,
        amount: points,
        reason: 'scoring_event',
        referenceType: 'scoring_event',
        referenceId: ev.id,
      });
    }
  }
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'scoring_event.create',
    entityType: 'scoring_event',
    entityId: ev.id,
    afterJson: body.data,
    metadataJson: { leagueId: body.data.leagueId },
  });
  res.status(201).json(ev);
});

// Vote-out points: match vote predictions with the person eliminated in that episode;
// award one point per vote (or scoring rule 'vote_correct') attributed to that person.
// Idempotent: removes existing vote_prediction ledger entries for this episode before applying.
// If votedOutContestantIds is empty/omitted, derive from contestants with eliminatedEpisodeId = episodeId.
adminRouter.post('/leagues/:leagueId/episodes/:episodeId/apply-vote-points', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const body = z.object({ votedOutContestantIds: z.array(z.number().int().positive()).optional() }).safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  let votedOutContestantIds = body.data.votedOutContestantIds ?? [];
  if (votedOutContestantIds.length === 0) {
    const eliminated = await db
      .select({ id: contestants.id })
      .from(contestants)
      .where(
        and(
          eq(contestants.leagueId, leagueId),
          eq(contestants.eliminatedEpisodeId, episodeId),
          eq(contestants.status, 'eliminated')
        )
      );
    votedOutContestantIds = eliminated.map((r) => r.id);
  }
  const [rule] = await db
    .select()
    .from(scoringRules)
    .where(and(eq(scoringRules.leagueId, leagueId), eq(scoringRules.actionType, 'vote_correct')));
  const pointsPerCorrect = rule?.points ?? 1;
  const predictions = await db
    .select()
    .from(votePredictions)
    .where(and(eq(votePredictions.leagueId, leagueId), eq(votePredictions.episodeId, episodeId)));
  const votedOutSet = new Set(votedOutContestantIds);
  const userIdPoints: Record<number, number> = {};
  for (const p of predictions) {
    if (votedOutSet.has(p.contestantId)) {
      const pts = (p.votes ?? 0) * pointsPerCorrect;
      userIdPoints[p.userId] = (userIdPoints[p.userId] ?? 0) + pts;
    }
  }
  const intendedTotal = Object.values(userIdPoints).reduce((s, n) => s + n, 0);
  const appliedCount = Object.entries(userIdPoints).filter(([, amt]) => amt > 0).length;

  await db.transaction(async (tx) => {
    await tx.delete(ledgerTransactions).where(
      and(
        eq(ledgerTransactions.leagueId, leagueId),
        eq(ledgerTransactions.reason, 'vote_prediction'),
        eq(ledgerTransactions.referenceType, 'episode'),
        eq(ledgerTransactions.referenceId, episodeId)
      )
    );
    for (const [userId, amount] of Object.entries(userIdPoints)) {
      if (amount <= 0) continue;
      await tx.insert(ledgerTransactions).values({
        leagueId,
        userId: parseInt(userId, 10),
        amount: Number(amount),
        reason: 'vote_prediction',
        referenceType: 'episode',
        referenceId: episodeId,
      });
    }
  });

  for (const contestantId of votedOutContestantIds) {
    await db
      .update(contestants)
      .set({ status: 'eliminated', eliminatedEpisodeId: episodeId })
      .where(and(eq(contestants.id, contestantId), eq(contestants.leagueId, leagueId)));
  }

  res.json({
    ok: true,
    applied: appliedCount,
    votedOutCount: votedOutContestantIds.length,
    totalPointsSynced: intendedTotal,
  });
});

const pointAdjustmentBody = z.object({
  userId: z.number().int().positive(),
  amount: z.number(),
  note: z.string().max(256).optional(),
});
adminRouter.post('/leagues/:leagueId/point-adjustments', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const parsed = pointAdjustmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [member] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, parsed.data.userId)));
  if (!member) {
    res.status(400).json({ error: 'User is not a member of this league' });
    return;
  }
  const [row] = await db
    .insert(ledgerTransactions)
    .values({
      leagueId,
      userId: parsed.data.userId,
      amount: parsed.data.amount,
      reason: 'adjustment',
      referenceType: 'adjustment',
    })
    .returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.point_adjustment',
    entityType: 'ledger_transaction',
    entityId: row.id,
    afterJson: { userId: parsed.data.userId, amount: parsed.data.amount },
    metadataJson: { leagueId, note: parsed.data.note ?? null },
  });
  res.status(201).json({ ok: true, id: row.id });
});

const votePointAdjustmentBody = z.object({
  userId: z.coerce.number().int().positive(),
  episodeId: z.coerce.number().int().positive(),
  amount: z.number(),
  note: z.string().max(256).optional(),
});
adminRouter.post('/leagues/:leagueId/vote-point-adjustments', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const parsed = votePointAdjustmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const [member] = await db
    .select()
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        eq(leagueMembers.userId, parsed.data.userId)
      )
    );
  if (!member) {
    res.status(400).json({ error: 'User is not a member of this league' });
    return;
  }
  const [ep] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, parsed.data.episodeId), eq(episodes.leagueId, leagueId)));
  if (!ep) {
    res.status(400).json({ error: 'Episode not found or does not belong to this league' });
    return;
  }
  const [row] = await db
    .insert(ledgerTransactions)
    .values({
      leagueId,
      userId: parsed.data.userId,
      amount: parsed.data.amount,
      reason: 'vote_prediction',
      referenceType: 'episode',
      referenceId: parsed.data.episodeId,
    })
    .returning();
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.vote_point_adjustment',
    entityType: 'ledger_transaction',
    entityId: row.id,
    afterJson: {
      userId: parsed.data.userId,
      episodeId: parsed.data.episodeId,
      amount: parsed.data.amount,
    },
    metadataJson: { leagueId, note: parsed.data.note ?? null },
  });
  res.status(201).json({ ok: true, id: row.id });
});

adminRouter.post('/leagues/:leagueId/recompute-leaderboard', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return;
  }
  const rules = await db.select().from(scoringRules).where(eq(scoringRules.leagueId, leagueId));
  const pointsByAction: Record<string, number> = {};
  for (const r of rules) pointsByAction[r.actionType] = r.points;

  const events = await db.select().from(scoringEvents).where(eq(scoringEvents.leagueId, leagueId));
  let applied = 0;
  await db.transaction(async (tx) => {
    await tx.delete(ledgerTransactions).where(
      and(eq(ledgerTransactions.leagueId, leagueId), eq(ledgerTransactions.reason, 'scoring_event'))
    );
    for (const ev of events) {
      const points = pointsByAction[ev.actionType] ?? 0;
      if (ev.contestantId && points !== 0) {
        const [teamRow] = await tx.select().from(teams).where(
          and(eq(teams.leagueId, leagueId), eq(teams.contestantId, ev.contestantId))
        );
        if (teamRow) {
          await tx.insert(ledgerTransactions).values({
            leagueId,
            userId: teamRow.userId,
            amount: points,
            reason: 'scoring_event',
            referenceType: 'scoring_event',
            referenceId: ev.id,
          });
          applied++;
        }
      }
    }
  });
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'admin.apply_scoring',
    entityType: 'league',
    entityId: leagueId,
    metadataJson: { applied, eventCount: events.length },
  });
  res.json({ ok: true, message: `Recalculated points from ${events.length} scoring events.` });
});

// ---------- Audit log & ledger (read-only export) ----------
adminRouter.get('/audit-log', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
  const rows = await db
    .select({
      id: auditLog.id,
      timestamp: auditLog.timestamp,
      actionType: auditLog.actionType,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      actorUserId: auditLog.actorUserId,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
      metadataJson: auditLog.metadataJson,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is number => id != null))];
  const usernamesById: Record<number, string> = {};
  if (actorIds.length > 0) {
    const userRows = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, actorIds));
    for (const u of userRows) usernamesById[u.id] = u.username;
  }
  const list = rows.map((r) => ({
    ...r,
    actorUsername: r.actorUserId != null ? usernamesById[r.actorUserId] ?? null : null,
  }));
  res.json({ auditLog: list });
});

adminRouter.get('/leagues/:leagueId/ledger', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'Invalid league id' });
    return;
  }
  const list = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.leagueId, leagueId)).orderBy(desc(ledgerTransactions.createdAt)).limit(500);
  res.json({ ledger: list });
});

// ---------- Export (CSV/JSON) ----------
function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => (v == null ? '' : String(v).replace(/"/g, '""')))
    .map((s) => (s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s))
    .join(',');
}

adminRouter.get('/export/audit-log', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 2000, 5000);
  const format = (req.query.format as string) || 'json';
  const rows = await db
    .select({
      id: auditLog.id,
      timestamp: auditLog.timestamp,
      actionType: auditLog.actionType,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      actorUserId: auditLog.actorUserId,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
      metadataJson: auditLog.metadataJson,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is number => id != null))];
  const usernamesById: Record<number, string> = {};
  if (actorIds.length > 0) {
    const userRows = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, actorIds));
    for (const u of userRows) usernamesById[u.id] = u.username;
  }
  const list = rows.map((r) => ({
    ...r,
    actorUsername: r.actorUserId != null ? usernamesById[r.actorUserId] ?? null : null,
  }));
  if (format === 'csv') {
    const header = ['id', 'timestamp', 'actor_user_id', 'actor_username', 'action_type', 'entity_type', 'entity_id', 'before_json', 'after_json', 'metadata_json'];
    const csvRows = list.map((e) => [
      e.id,
      e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
      e.actorUserId,
      e.actorUsername ?? '',
      e.actionType,
      e.entityType,
      e.entityId,
      e.beforeJson ? JSON.stringify(e.beforeJson) : '',
      e.afterJson ? JSON.stringify(e.afterJson) : '',
      e.metadataJson ? JSON.stringify(e.metadataJson) : '',
    ]);
    const csv = [toCsvRow(header), ...csvRows.map((r) => toCsvRow(r))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
    res.send(csv);
    return;
  }
  res.json({ auditLog: list });
});

adminRouter.get('/export/ledger', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.query.leagueId as string, 10);
  if (Number.isNaN(leagueId)) {
    res.status(400).json({ error: 'leagueId required' });
    return;
  }
  const format = (req.query.format as string) || 'json';
  const list = await db
    .select()
    .from(ledgerTransactions)
    .where(eq(ledgerTransactions.leagueId, leagueId))
    .orderBy(desc(ledgerTransactions.createdAt))
    .limit(5000);
  if (format === 'csv') {
    const header = ['id', 'league_id', 'user_id', 'amount', 'reason', 'reference_type', 'reference_id', 'created_at'];
    const rows = list.map((e) => [
      e.id,
      e.leagueId,
      e.userId,
      e.amount,
      e.reason,
      e.referenceType,
      e.referenceId,
      e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    ]);
    const csv = [toCsvRow(header), ...rows.map((r) => toCsvRow(r))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ledger-${leagueId}.csv`);
    res.send(csv);
    return;
  }
  res.json({ ledger: list });
});
