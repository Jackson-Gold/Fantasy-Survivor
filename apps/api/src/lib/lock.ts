/**
 * Weekly lock: Wednesday 8:00 PM America/New_York.
 * DST-safe via date-fns-tz.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { setHours, setMinutes, setSeconds, getDay, addDays, isBefore } from 'date-fns';

const ET_ZONE = 'America/New_York';

/**
 * Get the next Wednesday 8:00 PM America/New_York after `from`.
 * Returns a Date (UTC) representing that moment.
 */
export function getNextLockTime(from: Date = new Date()): Date {
  const inET = toZonedTime(from, ET_ZONE);
  const wednesday = 3; // 0 = Sun
  let daysUntilWed = (wednesday - getDay(inET) + 7) % 7;
  if (daysUntilWed === 0) {
    const hour = inET.getHours();
    const min = inET.getMinutes();
    if (hour > 20 || (hour === 20 && min >= 0)) daysUntilWed = 7;
  }
  let nextWed = addDays(inET, daysUntilWed);
  nextWed = setHours(nextWed, 20);
  nextWed = setMinutes(nextWed, 0);
  nextWed = setSeconds(nextWed, 0);
  return fromZonedTime(nextWed, ET_ZONE);
}

/**
 * Get the lock time for the week containing the given date: Wednesday 8pm ET on or before that date.
 * (If the episode airs Thursday, lock was Wednesday 8pm of that week.)
 */
export function getLockTimeForWeek(airDate: Date): Date {
  const inET = toZonedTime(airDate, ET_ZONE);
  const wednesday = 3;
  let daysBack = getDay(inET) - wednesday;
  if (daysBack < 0) daysBack += 7;
  const thatWed = addDays(inET, -daysBack);
  const wed8pm = setSeconds(setMinutes(setHours(thatWed, 20), 0), 0);
  return fromZonedTime(wed8pm, ET_ZONE);
}

/**
 * Is the current time past the episode's lock? (Writes forbidden.)
 */
export function isLocked(lockAt: Date, now: Date = new Date()): boolean {
  return !isBefore(now, lockAt);
}
