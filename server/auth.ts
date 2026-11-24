import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PublicUser, UserRole } from '../src/types.ts';

const RUNTIME_SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

export interface TokenPayload {
  userId: string;
  role: UserRole;
  businessId?: string;
  staffId?: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: PublicUser;
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(plain, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function signSessionToken(user: PublicUser): string {
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    businessId: user.businessId,
    staffId: user.staffId,
    exp: Date.now() + 1000 * 60 * 60 * 24, // 24 hours
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    if (!decoded.userId || !decoded.role || !decoded.exp) return null;
    if (Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyEnvAdminPasscode(candidate: string): boolean {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (!envPass) return false;
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(envPass, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasEnvAdminPasscode(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export function createAuthMiddleware(getUserById: (id: string) => PublicUser | null) {
  return function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
      return;
    }
    const user = getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }
    req.authUser = user;
    next();
  };
}

export function requireRoles(...allowed: UserRole[]) {
  return function roleGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowed.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Access denied for your account role.' });
      return;
    }
    next();
  };
}
