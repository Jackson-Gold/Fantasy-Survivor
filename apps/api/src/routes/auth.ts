import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const secret = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production';
const TOKEN_EXPIRY = '7d';

const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { username, password } = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }
  await logAudit({
    actorUserId: user.id,
    actionType: 'user.login',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip ?? req.socket.remoteAddress,
    userAgent: req.get('user-agent') ?? undefined,
  });
  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: TOKEN_EXPIRY });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl ?? undefined,
    },
    token,
  });
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

const verifyAdminBody = z.object({ password: z.string().min(1) });

authRouter.post('/verify-admin', requireAuth, async (req: Request, res: Response) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  const parsed = verifyAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const ok = await argon2.verify(user.passwordHash, parsed.data.password);
  if (!ok) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  res.json({ ok: true });
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'At least 8 characters'),
});

authRouter.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const parsed = changePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const ok = await argon2.verify(user.passwordHash, currentPassword);
  if (!ok) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }
  const hash = await argon2.hash(newPassword);
  await db.update(users).set({
    passwordHash: hash,
    mustChangePassword: false,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));
  await logAudit({
    actorUserId: user.id,
    actionType: 'user.password_change',
    entityType: 'user',
    entityId: user.id,
  });
  res.json({ ok: true });
});
