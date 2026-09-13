import crypto from 'crypto';

/**
 * Hash a plain text password using scrypt KDF with random 16-byte salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a plain text password against a stored salt:hash string using constant-time comparison.
 */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) {
    return false;
  }

  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;

    const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
    const calcBuf = Buffer.from(calculated, 'hex');
    const hashBuf = Buffer.from(hash, 'hex');

    if (calcBuf.length !== hashBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(calcBuf, hashBuf);
  } catch (err) {
    console.error('Password verification error:', err);
    return false;
  }
}
