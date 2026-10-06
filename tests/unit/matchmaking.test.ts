import { beforeAll, describe, expect, jest, test } from '@jest/globals';

const eq = (field: any, value: any) => ({ type: 'eq', field, value });
const and = (...args: any[]) => ({ type: 'and', args });
const asc = (field: any) => ({ type: 'asc', field });
const sql = () => ({ type: 'sql' });

const matchWhere = (row: any, predicate: any): boolean => {
  if (!predicate) return true;
  if (predicate.type === 'eq') return row[predicate.field] === predicate.value;
  if (predicate.type === 'and') return predicate.args.every((item: any) => matchWhere(row, item));
  return true;
};

jest.mock('drizzle-orm', () => ({ eq, and, asc, sql }));
jest.mock('@/lib/events', () => ({ publish: jest.fn() }));

const schema = {
  matchmakingTicket: {
    id: 'id',
    playerId: 'playerId',
    userId: 'userId',
    gameMode: 'gameMode',
    rating: 'rating',
    status: 'status',
    matchId: 'matchId',
    enqueuedAt: 'enqueuedAt',
    updatedAt: 'updatedAt',
  },
  player: {
    id: 'id',
    userId: 'userId',
    username: 'username',
    displayName: 'displayName',
    rating: 'rating',
    status: 'status',
  },
  match: {
    id: 'id',
    gameMode: 'gameMode',
    status: 'status',
  },
  matchPlayer: {
    id: 'id',
    matchId: 'matchId',
    playerId: 'playerId',
    userId: 'userId',
    team: 'team',
    ratingBefore: 'ratingBefore',
  },
};

const tableNames = new Map(Object.entries(schema).map(([key, value]) => [value, key]));
const getTableName = (table: any) => (typeof table === 'string' ? table : tableNames.get(table) ?? 'unknown');

const makeQueryResult = (table: any, predicate?: any) => {
  const name = getTableName(table);
  const rows = predicate ? (store[name] ?? []).filter((row) => matchWhere(row, predicate)) : (store[name] ?? []);
  return {
    then: (resolve: any) => resolve(rows),
    limit: async (count = rows.length) => rows.slice(0, count),
    for: () => makeQueryResult(table, predicate),
    orderBy: async () => rows,
  };
};

jest.mock('@/lib/db/schema', () => schema);

const store: Record<string, any[]> = {
  matchmakingTicket: [],
  player: [],
  match: [],
  matchPlayer: [],
};

const mockDb: any = {
  transaction: async (callback: any) => callback(mockDb),
  execute: async () => undefined,
  delete: async (table: any) => {
    const name = getTableName(table);
    store[name] = [];
  },
  insert: (table: any) => ({
    values: async (vals: any) => {
      const rows = Array.isArray(vals) ? vals : [vals];
      const name = getTableName(table);
      store[name].push(...rows.map((v) => ({ ...v })));
      return Promise.resolve();
    },
  }),
  select: () => ({
    from: (table: any) => ({
      where: (predicate: any) => makeQueryResult(table, predicate),
      then: (resolve: any) => resolve(store[getTableName(table)] ?? []),
    }),
  }),
  update: (table: any) => ({
    set: (changes: any) => ({
      where: async (predicate: any) => {
        const name = getTableName(table);
        store[name] = (store[name] ?? []).map((row) =>
          matchWhere(row, predicate) ? { ...row, ...changes } : row,
        );
      },
    }),
  }),
};

jest.mock('@/lib/db', () => ({ db: mockDb }));

import { runMatchmakingTick as tick } from '@/lib/services/matchmaking';

describe('matchmaking.tick', () => {
  beforeAll(async () => {
    await mockDb.delete('matchmakingTicket');
    await mockDb.delete('match');
    await mockDb.delete('player');
  });

  test('pairs players within tolerance', async () => {
    await mockDb.insert('player').values([
      { id: 'p1', email: 'p1@example.com', displayName: 'P1', rating: 1500, userId: 'u1' },
      { id: 'p2', email: 'p2@example.com', displayName: 'P2', rating: 1520, userId: 'u2' },
    ]);

    await mockDb.insert('matchmakingTicket').values([
      { id: 't1', playerId: 'p1', userId: 'u1', rating: 1500, enqueuedAt: new Date(), gameMode: 'ranked_1v1', status: 'searching' },
      { id: 't2', playerId: 'p2', userId: 'u2', rating: 1520, enqueuedAt: new Date(), gameMode: 'ranked_1v1', status: 'searching' },
    ]);

    const result = await tick();

    expect(result.matchesCreated).toBeGreaterThanOrEqual(1);
    expect(store.match.length).toBeGreaterThanOrEqual(1);
  });
});
