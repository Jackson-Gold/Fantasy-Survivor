import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const limit = Math.min(Math.max(1, parseInt(String(req.query.limit), 10) || 20), 50);
  const list = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.actorUserId, userId))
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
  res.json({ activity: list });
});
