ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "invite_code" varchar(32) UNIQUE;
