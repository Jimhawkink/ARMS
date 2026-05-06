/**
 * ARMS Password Utilities
 * Uses bcryptjs (cost factor 12) for secure password hashing.
 * Works in both Node.js (API routes) and browser (client components).
 */
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/** Hash a plain-text password. Returns the bcrypt hash string. */
export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verify a plain-text password against a stored hash.
 * Also handles legacy plain-text passwords (migration period):
 * if the stored value does NOT start with '$2' it is treated as plain text.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
    if (!plain || !stored) return false;
    // Legacy plain-text check (will be removed after migration)
    if (!stored.startsWith('$2')) {
        return plain === stored;
    }
    return bcrypt.compare(plain, stored);
}

/** Returns true if the stored value is already a bcrypt hash. */
export function isHashed(stored: string): boolean {
    return stored?.startsWith('$2') ?? false;
}
