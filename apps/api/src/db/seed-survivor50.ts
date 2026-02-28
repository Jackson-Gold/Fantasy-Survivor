/**
 * Survivor 50 seed: 8 users, 22 contestants (from image filenames), one league, 2–3 episodes.
 * Run with: SURVIVOR50_SEED=1 npm run db:seed-survivor50 (from apps/api).
 */
import 'dotenv/config';
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
  scoringEvents,
  ledgerTransactions,
  teams,
  winnerPicks,
  votePredictions,
} from './schema.js';
import { eq, inArray } from 'drizzle-orm';
import { getLockTimeForWeek } from '../lib/lock.js';

const DEMO_USERNAMES = ['player1', 'player2', 'player3'];

const SURVIVOR50_USERS = [
  'AbShap', 'Jackson', 'leo', 'Lwat', 'Aarit', 'Ben', 'Gabi', 'AZemm',
];

/** Contestant display names derived from image filenames (e.g. colbySOLE.jpg -> Colby, _q_SOLE.jpg -> Q). */
const SURVIVOR50_CONTESTANTS = [
  'Angelina', 'Charlie', 'Tiffany', 'Chrissy', 'Colby', 'Rizo', 'Joe', 'Savannah',
  'Rick', 'Genevieve', 'Christian', 'Coach', 'Ozzy', 'Mike', 'Cirie', 'Q',
  'Dee', 'Kamilla', 'Stephenie', 'Jonathan', 'Emily', 'Aubry',
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

async function run(): Promise<void> {
  if (process.env.SURVIVOR50_SEED !== '1') {
    console.log('Set SURVIVOR50_SEED=1 to run Survivor 50 seed. Skipping.');
    process.exit(0);
    return;
  }

  let league = (await db.select().from(leagues).where(eq(leagues.name, 'Survivor 50')))[0]
    ?? (await db.select().from(leagues).where(eq(leagues.name, 'Demo League')))[0];

  if (league) {
    const leagueId = league.id;
    const epRows = await db.select({ id: episodes.id }).from(episodes).where(eq(episodes.leagueId, leagueId));
    const episodeIds = epRows.map((r) => r.id);

    if (episodeIds.length > 0) {
      await db.delete(votePredictions).where(inArray(votePredictions.episodeId, episodeIds));
      await db.delete(scoringEvents).where(inArray(scoringEvents.episodeId, episodeIds));
    }
    await db.delete(ledgerTransactions).where(eq(ledgerTransactions.leagueId, leagueId));
    await db.delete(episodes).where(eq(episodes.leagueId, leagueId));
    await db.delete(teams).where(eq(teams.leagueId, leagueId));
    await db.delete(winnerPicks).where(eq(winnerPicks.leagueId, leagueId));
    await db.delete(contestants).where(eq(contestants.leagueId, leagueId));
    await db.delete(scoringRules).where(eq(scoringRules.leagueId, leagueId));
    await db.delete(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    console.log('Cleared existing Survivor 50 / Demo League data');
  }

  for (const username of DEMO_USERNAMES) {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    if (u) {
      await db.delete(leagueMembers).where(eq(leagueMembers.userId, u.id));
      await db.delete(teams).where(eq(teams.userId, u.id));
      await db.delete(winnerPicks).where(eq(winnerPicks.userId, u.id));
      await db.delete(votePredictions).where(eq(votePredictions.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
      console.log('Removed demo user:', username);
    }
  }

  if (!league) {
    const [inserted] = await db.insert(leagues).values({
      name: 'Survivor 50',
      seasonName: 'Survivor 50',
      inviteCode: 'S50' + Date.now().toString(36).slice(-6).toUpperCase(),
    }).returning();
    league = inserted!;
    console.log('Created league: Survivor 50');
  } else if (league.name !== 'Survivor 50') {
    await db.update(leagues).set({ name: 'Survivor 50', seasonName: 'Survivor 50' }).where(eq(leagues.id, league.id));
    league = { ...league, name: 'Survivor 50', seasonName: 'Survivor 50' };
  }

  const leagueId = league.id;
  const playerIds: number[] = [];

  for (const username of SURVIVOR50_USERS) {
    let user = (await db.select().from(users).where(eq(users.username, username)))[0];
    if (!user) {
      const hash = await argon2.hash(username.toLowerCase() + '1');
      const [u] = await db.insert(users).values({
        username,
        passwordHash: hash,
        role: 'player',
        mustChangePassword: true,
      }).returning();
      user = u!;
      console.log('Created user:', username);
    }
    playerIds.push(user.id);
    await db.insert(leagueMembers).values({ leagueId, userId: user.id }).onConflictDoNothing();
  }
  console.log('League members:', playerIds.length);

  for (const name of SURVIVOR50_CONTESTANTS) {
    await db.insert(contestants).values({
      leagueId,
      name,
      status: 'active',
    });
  }
  console.log('Created', SURVIVOR50_CONTESTANTS.length, 'contestants');

  const now = new Date();
  const baseAir = addWeeks(now, 1);
  for (let i = 1; i <= 3; i++) {
    const airDate = addWeeks(baseAir, i - 1);
    const lockAt = getLockTimeForWeek(airDate);
    await db.insert(episodes).values({
      leagueId,
      episodeNumber: i,
      title: i === 1 ? 'VATU' : `Episode ${i}`,
      airDate,
      lockAt,
    });
  }
  console.log('Created 3 episodes');

  for (const a of DEFAULT_ACTIONS) {
    try {
      await db.insert(scoringRules).values({
        leagueId,
        actionType: a.actionType,
        points: a.points,
      });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code !== '23505') throw e;
    }
  }
  console.log('Survivor 50 seed done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
