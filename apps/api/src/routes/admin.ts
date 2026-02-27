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
