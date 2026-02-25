import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export type SessionUser = {
  id: number;
  username: string;
  role: 'admin' | 'player';
  mustChangePassword: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as unknown as { userId?: number; destroy?: (cb: (err?: Error) => void) => void };
  const uid = session?.userId;
  if (!uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const [user] = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    mustChangePassword: users.mustChangePassword,
  }).from(users).where(eq(users.id, uid));
  if (!user) {
    if (session.destroy) session.destroy(() => {});
    res.status(401).json({ error: 'Session invalid' });
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

export function requirePlayer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}
