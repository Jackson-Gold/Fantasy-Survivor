import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { z } from 'zod';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

const avatarBody = z.object({
  image: z.string().min(1), // data:image/jpeg;base64,... or data:image/png;base64,...
});

function getUploadsDir(): string {
  const base = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
  const avatarsDir = path.join(base, 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }
  return base;
}

profileRouter.post('/avatar', async (req: Request, res: Response) => {
  const parsed = avatarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const dataUrl = parsed.data.image;
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: 'Invalid image data URL' });
    return;
  }
  const mime = match[1];
  const base64 = match[2];
  if (!ALLOWED_TYPES.includes(mime)) {
    res.status(400).json({ error: 'Only JPEG and PNG allowed' });
    return;
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_SIZE) {
    res.status(400).json({ error: 'Image too large (max 2MB)' });
    return;
  }
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const uploadsDir = getUploadsDir();
  const filename = `avatar-${req.user!.id}-${Date.now()}.${ext}`;
  const filepath = path.join(uploadsDir, 'avatars', filename);
  fs.writeFileSync(filepath, buffer);
  const relativeUrl = `avatars/${filename}`;
  await db.update(users).set({ avatarUrl: relativeUrl, updatedAt: new Date() }).where(eq(users.id, req.user!.id));
  res.json({ avatar_url: relativeUrl });
});
