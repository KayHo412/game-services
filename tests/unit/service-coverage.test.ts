import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const publish = jest.fn()

const store: Record<string, any[]> = {
  player: [],
  friendship: [],
  match: [],
  matchPlayer: [],
}

const eq = (field: any, value: any) => ({ type: 'eq', field, value })
const and = (...args: any[]) => ({ type: 'and', args })
const or = (...args: any[]) => ({ type: 'or', args })

const matchWhere = (row: any, predicate: any): boolean => {
  if (!predicate) return true
  if (predicate.type === 'eq') return row[predicate.field] === predicate.value
  if (predicate.type === 'and') return predicate.args.every((item: any) => matchWhere(row, item))
  if (predicate.type === 'or') return predicate.args.some((item: any) => matchWhere(row, item))
  return true
}

const schema = {
  player: {
    id: 'id',
    userId: 'userId',
    username: 'username',
    displayName: 'displayName',
    rating: 'rating',
    wins: 'wins',
    losses: 'losses',
    draws: 'draws',
    gamesPlayed: 'gamesPlayed',
    status: 'status',
  },
  friendship: {
    id: 'id',
    requesterId: 'requesterId',
    addresseeId: 'addresseeId',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  match: {
    id: 'id',
    status: 'status',
    winnerPlayerId: 'winnerPlayerId',
    result: 'result',
    createdAt: 'createdAt',
    completedAt: 'completedAt',
  },
  matchPlayer: {
    id: 'id',
    matchId: 'matchId',
    playerId: 'playerId',
    userId: 'userId',
    ratingBefore: 'ratingBefore',
    ratingAfter: 'ratingAfter',
    ratingDelta: 'ratingDelta',
    outcome: 'outcome',
    team: 'team',
  },
}

const tableNames = new Map(Object.entries(schema).map(([key, value]) => [value, key]))
const getTableName = (table: any) => (typeof table === 'string' ? table : tableNames.get(table) ?? 'unknown')
const makeQueryResult = (table: any, predicate?: any) => {
  const name = getTableName(table)
  const rows = predicate ? (store[name] ?? []).filter((row) => matchWhere(row, predicate)) : (store[name] ?? [])
  return {
    then: (resolve: any) => resolve(rows),
    limit: async (max = rows.length) => rows.slice(0, max),
    orderBy: async () => rows,
  }
}

const mockDb: any = {
  select: () => ({
    from: (table: any) => ({
      where: (predicate: any) => makeQueryResult(table, predicate),
      then: (resolve: any) => resolve(store[getTableName(table)] ?? []),
    }),
  }),
  insert: (table: any) => ({
    values: (values: any) => {
      const rows = Array.isArray(values) ? values : [values]
      const name = getTableName(table)
      store[name].push(...rows.map((row) => ({ ...row })))
      return {
        returning: async () => rows,
      }
    },
  }),
  update: (table: any) => ({
    set: (changes: any) => ({
      where: (predicate: any) => {
        const name = getTableName(table)
        const rows = (store[name] ?? []).filter((row) => matchWhere(row, predicate))
        store[name] = (store[name] ?? []).map((row) =>
          matchWhere(row, predicate) ? { ...row, ...changes } : row,
        )
        return {
          returning: async () => rows.map((row) => ({ ...row, ...changes })),
        }
      },
    }),
  }),
  delete: (table: any) => ({
    where: async (predicate: any) => {
      const name = getTableName(table)
      store[name] = (store[name] ?? []).filter((row) => !matchWhere(row, predicate))
    },
  }),
}

jest.mock('drizzle-orm', () => ({ eq, and, or }))
jest.mock('@/lib/events', () => ({ publish }))
jest.mock('@/lib/session', () => ({
  HttpError: class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))
jest.mock('@/lib/db', () => ({ db: mockDb }))
jest.mock('@/lib/db/schema', () => schema)

import { listFriends, sendRequest, respondToRequest } from '@/lib/services/friends'
import { reportResult } from '@/lib/services/matches'

describe('service coverage', () => {
  beforeEach(() => {
    store.player = [
      { id: 'p1', userId: 'u1', username: 'alice', displayName: 'Alice', rating: 1200, wins: 5, losses: 2, draws: 1, gamesPlayed: 8, status: 'online' },
      { id: 'p2', userId: 'u2', username: 'bob', displayName: 'Bob', rating: 1400, wins: 7, losses: 3, draws: 0, gamesPlayed: 10, status: 'online' },
    ]
    store.friendship = [
      { id: 'f1', requesterId: 'p1', addresseeId: 'p2', status: 'accepted', createdAt: new Date('2024-01-01T00:00:00Z') },
    ]
    store.match = [
      { id: 'm1', gameMode: 'ranked_1v1', status: 'active', winnerPlayerId: null, result: null, createdAt: new Date('2024-01-01T00:00:00Z'), completedAt: null },
    ]
    store.matchPlayer = [
      { id: 'mp1', matchId: 'm1', playerId: 'p1', userId: 'u1', team: 0, ratingBefore: 1200, ratingAfter: null, ratingDelta: null, outcome: null },
      { id: 'mp2', matchId: 'm1', playerId: 'p2', userId: 'u2', team: 1, ratingBefore: 1400, ratingAfter: null, ratingDelta: null, outcome: null },
    ]
    publish.mockClear()
  })

  it('lists friend records with friend metadata', async () => {
    const rows = await listFriends('p1')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'f1',
      status: 'accepted',
      direction: 'outgoing',
      friend: { username: 'bob', displayName: 'Bob', rating: 1400 },
    })
  })

  it('creates a pending friend request and notifies the addressee', async () => {
    store.friendship = []

    const created = await sendRequest(store.player[0], 'bob')

    expect(created).toMatchObject({ requesterId: 'p1', addresseeId: 'p2', status: 'pending' })
    expect(publish).toHaveBeenCalledWith('u2', { type: 'friend_request', from: 'Alice' })
  })

  it('accepts a friend request and publishes a friend-accepted notification', async () => {
    store.friendship = [{ id: 'f2', requesterId: 'p1', addresseeId: 'p2', status: 'pending', createdAt: new Date('2024-01-01T00:00:00Z') }]

    const updated = await respondToRequest(store.player[1], 'f2', true)

    expect(updated).toMatchObject({ id: 'f2', status: 'accepted' })
    expect(publish).toHaveBeenCalledWith('u1', { type: 'friend_accepted', by: 'Bob' })
  })

  it('reports match results, updates Elo, and closes the match', async () => {
    const result = await reportResult('m1', 'p1')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ id: 'm1', status: 'completed', result: 'win' })
    expect(store.player.find((p) => p.id === 'p1')).toMatchObject({
      rating: expect.any(Number),
      wins: 6,
      status: 'online',
    })
    expect(store.player.find((p) => p.id === 'p2')).toMatchObject({
      rating: expect.any(Number),
      losses: 4,
      status: 'online',
    })
    expect(publish).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'match_completed' }))
    expect(publish).toHaveBeenCalledWith('u2', expect.objectContaining({ type: 'match_completed' }))
  })
})
