import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  real,
  jsonb,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 16 }).notNull().default('player'), // 'admin' | 'player'
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leagues = pgTable('leagues', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  seasonName: varchar('season_name', { length: 256 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leagueMembers = pgTable(
  'league_members',
  {
    leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })]
);

export const contestants = pgTable('contestants', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 256 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'), // active | eliminated
  eliminatedEpisodeId: integer('eliminated_episode_id'), // set when status = eliminated
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  episodeNumber: integer('episode_number').notNull(),
  title: varchar('title', { length: 256 }),
  airDate: timestamp('air_date', { withTimezone: true }).notNull(),
  lockAt: timestamp('lock_at', { withTimezone: true }).notNull(), // Wednesday 8pm ET for this episode
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contestantId: integer('contestant_id').notNull().references(() => contestants.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('teams_league_contestant').on(t.leagueId, t.contestantId)]);

export const winnerPicks = pgTable('winner_picks', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contestantId: integer('contestant_id').notNull().references(() => contestants.id, { onDelete: 'cascade' }),
  pickedAt: timestamp('picked_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('winner_picks_league_user').on(t.leagueId, t.userId)]);

export const votePredictions = pgTable('vote_predictions', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  episodeId: integer('episode_id').notNull().references(() => episodes.id, { onDelete: 'cascade' }),
  contestantId: integer('contestant_id').notNull().references(() => contestants.id, { onDelete: 'cascade' }),
  votes: integer('votes').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('vote_predictions_league_user_episode_contestant').on(t.leagueId, t.userId, t.episodeId, t.contestantId)]);

export const trades = pgTable('trades', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  proposerId: integer('proposer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  acceptorId: integer('acceptor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 32 }).notNull().default('proposed'), // proposed | pending | accepted | rejected | canceled
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tradeItems = pgTable('trade_items', {
  id: serial('id').primaryKey(),
  tradeId: integer('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  side: varchar('side', { length: 16 }).notNull(), // 'from_proposer' | 'from_acceptor'
  type: varchar('type', { length: 32 }).notNull(), // 'contestant' | 'points'
  contestantId: integer('contestant_id').references(() => contestants.id),
  points: integer('points'),
});

export const scoringRules = pgTable('scoring_rules', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  actionType: varchar('action_type', { length: 64 }).notNull(),
  points: real('points').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('scoring_rules_league_action').on(t.leagueId, t.actionType)]);

export const scoringEvents = pgTable('scoring_events', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  episodeId: integer('episode_id').notNull().references(() => episodes.id, { onDelete: 'cascade' }),
  actionType: varchar('action_type', { length: 64 }).notNull(),
  contestantId: integer('contestant_id').references(() => contestants.id),
  metadata: jsonb('metadata'), // e.g. { tribeName, challengeType }
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
});

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: serial('id').primaryKey(),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  reason: varchar('reason', { length: 64 }).notNull(), // e.g. 'vote_prediction', 'winner_pick', 'trade', 'scoring_event'
  referenceType: varchar('reference_type', { length: 32 }),
  referenceId: integer('reference_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  actionType: varchar('action_type', { length: 64 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: integer('entity_id'),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  metadataJson: jsonb('metadata_json'),
  ip: varchar('ip', { length: 64 }),
  userAgent: text('user_agent'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type League = typeof leagues.$inferSelect;
export type Contestant = typeof contestants.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type WinnerPick = typeof winnerPicks.$inferSelect;
export type VotePrediction = typeof votePredictions.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type TradeItem = typeof tradeItems.$inferSelect;
export type ScoringRule = typeof scoringRules.$inferSelect;
export type ScoringEvent = typeof scoringEvents.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
