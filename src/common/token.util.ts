import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_SECRET = 'ims-change-this-jwt-secret';

export function getTokenSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_SECRET;
}

export function signAuthToken(payload: Record<string, unknown>, expiresInSec = 60 * 60 * 24 * 7): string {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = createHmac('sha256', getTokenSecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyAuthToken(token: string): Record<string, unknown> {
  const [data, signature] = token.split('.');
  if (!data || !signature) {
    throw new Error('Invalid token');
  }
  const expected = createHmac('sha256', getTokenSecret()).update(data).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('Invalid token');
  }
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
  return payload;
}
