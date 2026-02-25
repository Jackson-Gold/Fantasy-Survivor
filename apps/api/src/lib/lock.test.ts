import { describe, it, expect } from 'vitest';
import { isLocked, getNextLockTime, getLockTimeForWeek } from './lock.js';

describe('lock', () => {
  it('isLocked returns true when now is past lockAt', () => {
    const lockAt = new Date('2025-01-01T01:00:00Z');
    const now = new Date('2025-01-01T02:00:00Z');
    expect(isLocked(lockAt, now)).toBe(true);
  });

  it('isLocked returns false when now is before lockAt', () => {
    const lockAt = new Date('2025-01-01T02:00:00Z');
    const now = new Date('2025-01-01T01:00:00Z');
    expect(isLocked(lockAt, now)).toBe(false);
  });

  it('isLocked returns true when now equals lockAt', () => {
    const t = new Date('2025-01-01T01:00:00Z');
    expect(isLocked(t, t)).toBe(true);
  });

  it('getNextLockTime returns a Wednesday', () => {
    const next = getNextLockTime(new Date('2025-01-06T12:00:00Z')); // Monday
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    expect(formatter.format(next)).toBe('Wed');
  });

  it('getLockTimeForWeek returns Wednesday 8pm ET for week of given date', () => {
    const thursday = new Date('2025-11-06T12:00:00Z'); // Thursday Nov 6
    const lock = getLockTimeForWeek(thursday);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    expect(formatter.format(lock)).toContain('Wed');
    expect(formatter.format(lock)).toMatch(/20:00|8:00/);
  });
});
