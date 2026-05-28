import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { findApiActorByToken } from './store-db';

export type ApiActor = {
  email: string;
};

export async function requireApiActor(req: NextRequest): Promise<ApiActor> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) {
    throw new Error('Invalid API token.');
  }

  const expected = process.env.SWAG_STORE_API_TOKEN;
  if (expected && safeTokenEquals(token, expected)) {
    return {
      email: process.env.SWAG_STORE_API_ACTOR_EMAIL ?? 'ai-assistant@inngest.com',
    };
  }

  const actor = await findApiActorByToken(token);
  if (actor) return actor;

  throw new Error(expected ? 'Invalid API token.' : 'No API tokens are configured. Generate one in the admin dashboard or set SWAG_STORE_API_TOKEN.');
}

function safeTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
