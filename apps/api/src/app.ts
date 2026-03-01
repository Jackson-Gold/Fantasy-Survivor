import express from 'express';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.js';
import { leaguesRouter } from './routes/leagues.js';
import { adminRouter } from './routes/admin.js';
import { teamsRouter } from './routes/teams.js';
import { predictionsRouter } from './routes/predictions.js';
import { tradesRouter } from './routes/trades.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { activityRouter } from './routes/activity.js';
import { profileRouter } from './routes/profile.js';

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: false,
    })
  );
  app.use(express.json());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many attempts' },
  });
  app.use('/api/v1/auth/login', authLimiter);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/leagues', leaguesRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/teams', teamsRouter);
  app.use('/api/v1/predictions', predictionsRouter);
  app.use('/api/v1/trades', tradesRouter);
  app.use('/api/v1/leaderboard', leaderboardRouter);
  app.use('/api/v1/activity', activityRouter);
  app.use('/api/v1/profile', profileRouter);

  const uploadsDir = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
  app.use('/api/v1/uploads', express.static(uploadsDir));

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
