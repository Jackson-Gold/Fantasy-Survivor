/**
 * Demo seed: one league, 3 players, ~10 contestants, 2–3 episodes, default scoring rules.
 * Run with: ALLOW_DEMO_SEED=1 npm run db:seed-demo (from apps/api).
 */
import 'dotenv/config';
import crypto from 'crypto';
import argon2 from 'argon2';
import { addWeeks } from 'date-fns';
import { db } from './index.js';
import {
  users,
  leagues,
  leagueMembers,
  contestants,
  episodes,
  scoringRules,
} from './schema.js';
import { eq } from 'drizzle-orm';
import { getLockTimeForWeek } from '../lib/lock.js';

const DEMO_PLAYERS = [
  { username: 'player1', password: 'player1' },
  { username: 'player2', password: 'player2' },
  { username: 'player3', password: 'player3' },
];

const DEFAULT_ACTIONS = [
  { actionType: 'tribe_reward_win', points: 5 },
  { actionType: 'tribe_immunity_win', points: 5 },
  { actionType: 'individual_immunity', points: 10 },
  { actionType: 'idol_found', points: 5 },
  { actionType: 'idol_played', points: 10 },
  { actionType: 'survived_tribal', points: 2 },
  { actionType: 'eliminated', points: -5 },
  { actionType: 'vote_correct', points: 3 },
  { actionType: 'winner_placement_1', points: 50 },
  { actionType: 'winner_placement_2', points: 25 },
  { actionType: 'winner_placement_3', points: 15 },
];

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function run(): Promise<void> {
  if (process.env.ALLOW_DEMO_SEED !== '1') {
    console.log('Set ALLOW_DEMO_SEED=1 to run demo seed. Skipping.');
    process.exit(0);
    return;
  }

  let league = (await db.select().from(leagues).where(eq(leagues.name, 'Demo League')))[0];
  if (league) {
    console.log('Demo league already exists. Skipping.');
    process.exit(0);
    return;
  }

  const inviteCode = generateInviteCode();
  const [insertedLeague] = await db
    .insert(leagues)
    .values({
      name: 'Demo League',
      seasonName: 'Season 1',
      inviteCode,
    })
    .returning();
  league = insertedLeague!;
  console.log('Created Demo League, invite code:', inviteCode);

  const playerIds: number[] = [];
  for (const { username, password } of DEMO_PLAYERS) {
    let user = (await db.select().from(users).where(eq(users.username, username)))[0];
    if (!user) {
      const hash = await argon2.hash(password);
      const [u] = await db
        .insert(users)
        .values({
          username,
          passwordHash: hash,
          role: 'player',
          mustChangePassword: true,
        })
        .returning();
      user = u!;
      console.log('Created user:', username);
    }
    playerIds.push(user.id);
    await db
      .insert(leagueMembers)
      .values({ leagueId: league.id, userId: user.id })
      .onConflictDoNothing();
  }
  console.log('League members:', playerIds.length);

  const contestantNames = [
    'Alex', 'Jordan', 'Sam', 'Casey', 'Riley',
    'Morgan', 'Quinn', 'Avery', 'Dakota', 'Reese',
  ];
  for (const name of contestantNames) {
    await db.insert(contestants).values({
      leagueId: league.id,
      name,
      status: 'active',
    });
  }
  console.log('Created', contestantNames.length, 'contestants');

  const now = new Date();
  const baseAir = addWeeks(now, 1);

  for (let i = 1; i <= 3; i++) {
    const airDate = addWeeks(baseAir, i - 1);
    const lockAt = getLockTimeForWeek(airDate);
    await db.insert(episodes).values({
      leagueId: league.id,
      episodeNumber: i,
      title: `Episode ${i}`,
      airDate,
      lockAt,
    });
  }
  console.log('Created 3 episodes');

  for (const a of DEFAULT_ACTIONS) {
    try {
      await db.insert(scoringRules).values({
        leagueId: league.id,
        actionType: a.actionType,
        points: a.points,
      });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code !== '23505') throw e;
    }
  }
  console.log('Created default scoring rules');

  console.log('Demo seed done. Invite code:', inviteCode);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
