import { describe, expect, it, jest } from '@jest/globals';


jest.mock('../../lib/session', () => ({
  requireUserId: jest.fn<any>().mockResolvedValue('test-user-id'),
  getPlayerByUserId: jest.fn<any>().mockResolvedValue(undefined),
  HttpError: class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}));

jest.mock('../../lib/db', () => {
  const mockSelect = jest.fn<any>().mockReturnValue({
    from: jest.fn<any>().mockReturnValue({
      where: jest.fn<any>().mockReturnValue({ limit: async () => [] }),
    }),
  });
  const mockInsert = jest.fn<any>().mockReturnValue({ values: jest.fn<any>().mockReturnThis(), returning: jest.fn<any>().mockResolvedValue([{ id: 'p1', email: 'alice@example.com' }]) });
  return { db: { select: mockSelect, insert: mockInsert } };
});

const { POST } = require('../../app/api/players/route') as typeof import('../../app/api/players/route');

describe('POST /api/players', () => {
  it('creates a new player', async () => {
    const req = { json: async () => ({ username: 'alice', displayName: 'Alice' }) } as any;
    const resp = await POST(req);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ email: 'alice@example.com' });
  });
});