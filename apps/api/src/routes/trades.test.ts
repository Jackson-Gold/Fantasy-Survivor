import { describe, it, expect } from 'vitest';

type TradeItem = { type: 'contestant'; contestantId: number } | { type: 'points'; points: number };

function pointsFromItems(items: TradeItem[]): number {
  return items.filter((i): i is { type: 'points'; points: number } => i.type === 'points').reduce((s, i) => s + i.points, 0);
}

describe('trade atomicity', () => {
  it('swap and ledger balance (logic placeholder)', () => {
    const proposerItems: TradeItem[] = [{ type: 'contestant', contestantId: 1 }, { type: 'points', points: 5 }];
    const acceptorItems: TradeItem[] = [{ type: 'contestant', contestantId: 2 }];
    expect(pointsFromItems(proposerItems)).toBe(5);
    expect(pointsFromItems(acceptorItems)).toBe(0);
  });
});
