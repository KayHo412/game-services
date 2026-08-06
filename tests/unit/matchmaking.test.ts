import { beforeAll, describe, expect, jest, test } from '@jest/globals';

jest.mock('@/lib/db/schema', () => ({
  matchmakingTicket: 'matchmakingTicket',
  player: 'player',
  match: 'match',
  matchPlayer: 'matchPlayer',
}));

const store: Record<string, any[]> = {
  matchmakingTicket: [],
  player: [],
  match: [],
  matchPlayer: [],
};

const mockDb: any = {
  delete: async (table: string) => {
    store[table] = [];
  },
  insert: (table: string) => ({
    values: async (vals: any) => {
      if (Array.isArray(vals)) store[table].push(...vals.map((v) => ({ ...v })));
      else store[table].push({ ...vals });
      return Promise.resolve();
    },
  }),
  select: () => ({
    from: (table: string) => ({
      where: () => ({
        orderBy: async () => store[table] ?? [],
        limit: async () => store[table] ?? [],
      }),
      // allow direct await on from(...)
      then: (resolve: any) => resolve(store[table] ?? []),
    }),
  }),
  update: (table: string) => ({ set: () => ({ where: async () => {} }) }),
};

jest.mock('@/lib/db', () => ({ db: mockDb }));

import { runMatchmakingTick as tick } from '../../lib/services/matchmaking';

describe('matchmaking.tick', () => {
  beforeAll(async () => {
    await mockDb.delete('matchmakingTicket');
    await mockDb.delete('match');
    await mockDb.delete('player');
  });

  test('pairs players within tolerance', async () => {
    // create two players
    await mockDb.insert('player').values([
      { id: 'p1', email: 'p1@example.com', displayName: 'P1', rating: 1500, userId: 'u1' },
      { id: 'p2', email: 'p2@example.com', displayName: 'P2', rating: 1520, userId: 'u2' },
    ]);

    // enqueue them
    await mockDb.insert('matchmakingTicket').values([
      { id: 't1', playerId: 'p1', userId: 'u1', rating: 1500, enqueuedAt: new Date(), gameMode: 'ranked_1v1', status: 'searching' },
      { id: 't2', playerId: 'p2', userId: 'u2', rating: 1520, enqueuedAt: new Date(), gameMode: 'ranked_1v1', status: 'searching' },
    ]);

    await tick();

    const matches = store.match;
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
