import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export type SessionUser = {
  id: number;
  username: string;
  role: 'admin' | 'player';
  mustChangePassword: boolean;
  avatarUrl?: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const secret = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const token = auth.slice(7);
  let payload: { userId: number };
  try {
    payload = jwt.verify(token, secret) as { userId: number };
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const [user] = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    mustChangePassword: users.mustChangePassword,
    avatarUrl: users.avatarUrl,
  }).from(users).where(eq(users.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.user = user as SessionUser;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
}

/** No-op: admin re-auth removed for simplicity. */
export function requireAdminVerified(_req: Request, _res: Response, next: NextFunction) {
  next();
}

export function requirePlayer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}
