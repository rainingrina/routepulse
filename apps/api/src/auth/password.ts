import bcrypt from 'bcryptjs';

/**
 * Password verification with the existing bcrypt hashing (cost 10, seed.ts).
 * When the account does not exist (or is inactive), a dummy hash is still compared so the
 * response time does not reveal whether an email is registered.
 */
const DUMMY_HASH = bcrypt.hashSync('routepulse-dummy-password-not-used', 10);

export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, passwordHash ?? DUMMY_HASH);
  return passwordHash !== null && matches;
}
