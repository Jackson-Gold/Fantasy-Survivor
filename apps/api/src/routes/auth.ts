import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

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
  const session = req.session as unknown as { userId: number; username: string };
  session.userId = user.id;
  session.username = user.username;
  await logAudit({
    actorUserId: user.id,
    actionType: 'user.login',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip ?? req.socket.remoteAddress,
    userAgent: req.get('user-agent') ?? undefined,
  });
  const payload = {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify(payload));
});

authRouter.post('/logout', requireAuth, (req: Request, res: Response) => {
  const uid = (req as Request & { user?: { id: number } }).user?.id;
  (req.session as unknown as { destroy: (cb: (err?: Error) => void) => void }).destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    if (uid) {
      logAudit({
        actorUserId: uid,
        actionType: 'user.logout',
        entityType: 'user',
        entityId: uid,
      }).catch(() => {});
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
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
