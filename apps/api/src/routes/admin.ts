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
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireAdmin, requireAdminVerified } from '../middleware/auth.js';

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
import { getLockTimeForWeek } from '../lib/lock.js';
import { logAudit } from '../lib/audit.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin, requireAdminVerified);

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
  try {
    const [user] = await db
      .insert(users)
      .values({
        username: parsed.data.username,
        passwordHash: hash,
        role: parsed.data.role ?? 'player',
        mustChangePassword: true,
      })
      .returning();
    await logAudit({
      actorUserId: req.user!.id,
      actionType: 'user.create',
      entityType: 'user',
      entityId: user.id,
      afterJson: { username: user.username, role: user.role },
    });
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
  await db.update(users).set({ passwordHash: hash, mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
  await logAudit({
    actorUserId: req.user!.id,
    actionType: 'user.password_change',
    entityType: 'user',
    entityId: id,
    metadataJson: { resetByAdmin: true },
  });
  res.json({ ok: true });
});

adminRouter.get('/users', async (_req: Request, res: Response) => {
  const list = await db.select({ id: users.id, username: users.username, role: users.role, mustChangePassword: users.mustChangePassword }).from(users);
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
  const updates: { name?: string; seasonName?: string; inviteCode?: string } = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.seasonName !== undefined) updates.seasonName = body.data.seasonName;
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
  const members = await db.select({ userId: leagueMembers.userId, username: users.username }).from(leagueMembers).innerJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, leagueId));
  const picks = await db.select({ userId: winnerPicks.userId, contestantId: winnerPicks.contestantId, name: contestants.name }).from(winnerPicks).innerJoin(contestants, eq(winnerPicks.contestantId, contestants.id)).where(eq(winnerPicks.leagueId, leagueId));
  const pickByUser = new Map(picks.map((p) => [p.userId, { contestantId: p.contestantId, name: p.name }]));
  const list = members.map((m) => ({ userId: m.userId, username: m.username, pick: pickByUser.get(m.userId) ?? null }));
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
  const members = await db.select({ userId: leagueMembers.userId, username: users.username }).from(leagueMembers).innerJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, leagueId));
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
  const list = members.map((m) => ({ userId: m.userId, username: m.username, allocations: byUser.get(m.userId) ?? [] }));
  res.json({ episodeId, votesByUser: list });
});

const putVotesBody = z.object({
  userId: z.number().int().positive(),
  allocations: z.array(z.object({ contestantId: z.number().int().positive(), votes: z.number().int().min(0) })),
});
adminRouter.put('/leagues/:leagueId/episodes/:episodeId/votes', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const body = putVotesBody.safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId) || !body.success) {
    res.status(400).json({ error: 'Invalid request', details: body.success ? undefined : body.error.flatten() });
    return;
  }
  const total = body.data.allocations.reduce((s, a) => s + a.votes, 0);
  if (total !== defaultVoteTotal) {
    res.status(400).json({ error: `Total votes must equal ${defaultVoteTotal}` });
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
  const members = await db.select({ userId: leagueMembers.userId, username: users.username }).from(leagueMembers).innerJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, leagueId));
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
  const list = members.map((m) => ({ userId: m.userId, username: m.username, roster: byUser.get(m.userId) ?? [] }));
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
  const body = z.object({ status: z.enum(['active', 'eliminated', 'injured']).optional(), eliminatedEpisodeId: z.number().optional() }).safeParse(req.body);
  if (Number.isNaN(id) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  await db.update(contestants).set(body.data).where(eq(contestants.id, id));
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
  });
  res.status(201).json(ev);
});

// Vote-out points: after admin marks who was voted out, award points for correct predictions
adminRouter.post('/leagues/:leagueId/episodes/:episodeId/apply-vote-points', async (req: Request, res: Response) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const episodeId = parseInt(req.params.episodeId, 10);
  const body = z.object({ votedOutContestantIds: z.array(z.number().int().positive()) }).safeParse(req.body);
  if (Number.isNaN(leagueId) || Number.isNaN(episodeId) || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const [rule] = await db
    .select()
    .from(scoringRules)
    .where(and(eq(scoringRules.leagueId, leagueId), eq(scoringRules.actionType, 'vote_correct')));
  const pointsPerCorrect = rule?.points ?? 3;
  const predictions = await db
    .select()
    .from(votePredictions)
    .where(and(eq(votePredictions.leagueId, leagueId), eq(votePredictions.episodeId, episodeId)));
  const votedOutSet = new Set(body.data.votedOutContestantIds);
  const userIdPoints: Record<number, number> = {};
  for (const p of predictions) {
    if (votedOutSet.has(p.contestantId)) {
      const pts = (p.votes ?? 0) * pointsPerCorrect;
      userIdPoints[p.userId] = (userIdPoints[p.userId] ?? 0) + pts;
    }
  }
  for (const [userId, amount] of Object.entries(userIdPoints)) {
    if (amount <= 0) continue;
    await db.insert(ledgerTransactions).values({
      leagueId,
      userId: parseInt(userId, 10),
      amount,
      reason: 'vote_prediction',
      referenceType: 'episode',
      referenceId: episodeId,
    });
  }
  res.json({ ok: true, applied: Object.keys(userIdPoints).length });
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
  // Leaderboard totals are always derived from ledger_transactions; no recomputation needed.
  res.json({ ok: true, message: 'Leaderboard is derived from ledger; no recompute needed.' });
});

// ---------- Audit log & ledger (read-only export) ----------
adminRouter.get('/audit-log', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
  const list = await db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(limit);
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
  const list = await db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(limit);
  if (format === 'csv') {
    const header = ['id', 'timestamp', 'actor_user_id', 'action_type', 'entity_type', 'entity_id', 'before_json', 'after_json', 'metadata_json'];
    const rows = list.map((e) => [
      e.id,
      e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
      e.actorUserId,
      e.actionType,
      e.entityType,
      e.entityId,
      e.beforeJson ? JSON.stringify(e.beforeJson) : '',
      e.afterJson ? JSON.stringify(e.afterJson) : '',
      e.metadataJson ? JSON.stringify(e.metadataJson) : '',
    ]);
    const csv = [toCsvRow(header), ...rows.map((r) => toCsvRow(r))].join('\n');
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
