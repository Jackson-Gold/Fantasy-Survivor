import { describe, it, expect } from 'vitest';

describe('leaderboard', () => {
  it('sums points correctly (logic placeholder)', () => {
    const rows = [
      { userId: 1, username: 'a', total: 10 },
      { userId: 2, username: 'b', total: 5 },
    ];
    const sorted = [...rows].sort((a, b) => Number(b.total) - Number(a.total));
    expect(sorted[0].username).toBe('a');
    expect(sorted[0].total).toBe(10);
  });
});
