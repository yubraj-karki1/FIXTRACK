import bcrypt from 'bcrypt';

const saltRounds = 12;
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$/;

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
