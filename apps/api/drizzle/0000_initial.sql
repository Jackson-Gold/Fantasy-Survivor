-- Fantasy Survivor initial schema
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" varchar(64) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" varchar(16) NOT NULL DEFAULT 'player',
  "must_change_password" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "leagues" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(256) NOT NULL,
  "season_name" varchar(256),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "league_members" (
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("league_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "contestants" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "name" varchar(256) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "eliminated_episode_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "episodes" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "episode_number" integer NOT NULL,
  "title" varchar(256),
  "air_date" timestamp with time zone NOT NULL,
  "lock_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "teams" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contestant_id" integer NOT NULL REFERENCES "contestants"("id") ON DELETE CASCADE,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "teams_league_contestant" ON "teams" ("league_id", "contestant_id");

CREATE TABLE IF NOT EXISTS "winner_picks" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contestant_id" integer NOT NULL REFERENCES "contestants"("id") ON DELETE CASCADE,
  "picked_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "winner_picks_league_user" ON "winner_picks" ("league_id", "user_id");

CREATE TABLE IF NOT EXISTS "vote_predictions" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "contestant_id" integer NOT NULL REFERENCES "contestants"("id") ON DELETE CASCADE,
  "votes" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vote_predictions_league_user_episode_contestant" ON "vote_predictions" ("league_id", "user_id", "episode_id", "contestant_id");

CREATE TABLE IF NOT EXISTS "trades" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "proposer_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "acceptor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(32) NOT NULL DEFAULT 'proposed',
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "trade_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "trade_id" integer NOT NULL REFERENCES "trades"("id") ON DELETE CASCADE,
  "side" varchar(16) NOT NULL,
  "type" varchar(32) NOT NULL,
  "contestant_id" integer REFERENCES "contestants"("id"),
  "points" integer
);

CREATE TABLE IF NOT EXISTS "scoring_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "action_type" varchar(64) NOT NULL,
  "points" real NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "scoring_rules_league_action" ON "scoring_rules" ("league_id", "action_type");

CREATE TABLE IF NOT EXISTS "scoring_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "action_type" varchar(64) NOT NULL,
  "contestant_id" integer REFERENCES "contestants"("id"),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "ledger_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" real NOT NULL,
  "reason" varchar(64) NOT NULL,
  "reference_type" varchar(32),
  "reference_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id"),
  "action_type" varchar(64) NOT NULL,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" integer,
  "before_json" jsonb,
  "after_json" jsonb,
  "metadata_json" jsonb,
  "ip" varchar(64),
  "user_agent" text
);
