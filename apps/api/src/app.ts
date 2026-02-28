import express from 'express';
import session from 'express-session';
import cors from 'cors';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { authRouter } from './routes/auth.js';
import { leaguesRouter } from './routes/leagues.js';
import { adminRouter } from './routes/admin.js';
import { teamsRouter } from './routes/teams.js';
import { predictionsRouter } from './routes/predictions.js';
import { tradesRouter } from './routes/trades.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { activityRouter } from './routes/activity.js';

const pgSession = connectPgSimple(session);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

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
      credentials: true,
    })
  );
  app.use(express.json());

  app.use(
    session({
      store: new pgSession({ pool, tableName: 'user_sessions' }),
      secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

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

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
