import bcrypt from 'bcrypt';

const saltRounds = 12;
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$/;

// How many previous password hashes are retained per account to block reuse.
export const passwordHistoryLimit = 5;

// How long a password stays valid before login is blocked pending a reset.
export const maxPasswordAgeMs = 90 * 24 * 60 * 60 * 1000;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function isPasswordHash(password: string | undefined): boolean {
  return Boolean(password && bcryptHashPattern.test(password));
}

export function validatePasswordStrength(password: string, email: string): PasswordValidationResult {
  const errors: string[] = [];
  const normalizedPassword = password.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const emailName = normalizedEmail.split('@')[0] || '';

  if (password.length < 8) errors.push('Password must be at least 8 characters long.');
  if (password.length > 20) errors.push('Password must be no more than 20 characters long.');
  if (!/[A-Z]/.test(password)) errors.push('Password must include at least one uppercase letter.');
  if (!/[a-z]/.test(password)) errors.push('Password must include at least one lowercase letter.');
  if (!/\d/.test(password)) errors.push('Password must include at least one number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must include at least one special character.');
  if (
    normalizedEmail &&
    (normalizedPassword.includes(normalizedEmail) || (emailName.length >= 3 && normalizedPassword.includes(emailName)))
  ) {
    errors.push('Password cannot contain your email address.');
  }

  return { valid: errors.length === 0, errors };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, saltRounds);
}

export async function verifyPassword(password: string, storedPassword: string | undefined): Promise<boolean> {
  if (!storedPassword) return false;
  if (isPasswordHash(storedPassword)) {
    return bcrypt.compare(password, storedPassword);
  }

  return storedPassword === password;
}

export function ensurePasswordHash(password: string | undefined): string | undefined {
  if (!password || isPasswordHash(password)) return password;
  return hashPasswordSync(password);
}

//Checks a candidate password against the account's current password and its retained
//history hashes, so a user cannot immediately reuse a recent password.

export async function wasPasswordUsedBefore(password: string, currentPasswordHash: 
  string | undefined, history: string[] | undefined): Promise<boolean> {
  const hashesToCheck = [...(currentPasswordHash ? [currentPasswordHash] : []), ...(history || [])];
  for (const hash of hashesToCheck) {
    if (await verifyPassword(password, hash)) return true;
  }
  return false;
}

//Appends the outgoing password hash to the retained history, trimmed to the configured limit.

export function appendPasswordHistory(previousPasswordHash: 
  string | undefined, history: string[] | undefined): string[] {
  const updatedHistory = [...(previousPasswordHash ? [previousPasswordHash] : []), ...(history || [])];
  return updatedHistory.slice(0, passwordHistoryLimit);
}

//Passwords expiry

export function isPasswordExpired(passwordChangedAt: string | undefined): boolean {
  if (!passwordChangedAt) return false;
  const changedAt = new Date(passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return false;
  return Date.now() - changedAt.getTime() > maxPasswordAgeMs;
}
