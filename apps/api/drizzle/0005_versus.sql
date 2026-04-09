ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "versus_win_points" integer DEFAULT 10;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "versus_pred_immunity_pts" integer DEFAULT 5;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "versus_pred_boot_pts" integer DEFAULT 5;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "versus_pred_idol_pts" integer DEFAULT 5;

CREATE TABLE IF NOT EXISTS "versus_matchups" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "user1_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user2_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "versus_matchups_league_episode_user1_idx" ON "versus_matchups" ("league_id", "episode_id", "user1_id");

CREATE TABLE IF NOT EXISTS "versus_draft_picks" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contestant_id" integer NOT NULL REFERENCES "contestants"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "versus_draft_picks_unique" ON "versus_draft_picks" ("league_id", "episode_id", "user_id", "contestant_id");

CREATE TABLE IF NOT EXISTS "versus_predictions" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slot" varchar(16) NOT NULL,
  "contestant_id" integer NOT NULL REFERENCES "contestants"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "versus_predictions_unique" ON "versus_predictions" ("league_id", "episode_id", "user_id", "slot");
