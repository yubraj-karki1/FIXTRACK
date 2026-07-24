
import type { User } from '@/types';

export function getDashboardPath(userOrEmail: User | string): string {
  const role = typeof userOrEmail === 'string' ? '' : userOrEmail.role;
  if (role === 'Maintenance Staff') return '/staff';
  return '/student';
}

export function isAdminUser(userOrEmail?: User | string): boolean {
  if (!userOrEmail) return false;

  return typeof userOrEmail !== 'string' && userOrEmail.role === 'Administrator';
}

export function isAdminOnlyPath(path?: string | null): boolean {
  return !!path && (path === '/admin' || path.startsWith('/admin/'));
}

export function getLoginTarget(requestedNext: string | null, userOrEmail: User | string): string {
  // Reject protocol-relative/external targets supplied through the query string.
  const isSafeInternalPath = requestedNext?.startsWith('/') && !requestedNext.startsWith('//');
  if (requestedNext && isSafeInternalPath && (!isAdminOnlyPath(requestedNext) || isAdminUser(userOrEmail))) {
    return requestedNext;
  }

  return getDashboardPath(userOrEmail);
}

export interface PasswordRule {
  label: string;
  met: boolean;
}

export function getPasswordRules(password: string, email: string): PasswordRule[] {
  const normalizedPassword = password.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const emailName = normalizedEmail.split('@')[0] || '';
  const containsEmail =
    Boolean(normalizedEmail && normalizedPassword.includes(normalizedEmail)) ||
    Boolean(emailName.length >= 3 && normalizedPassword.includes(emailName));

  return [
    { label: '12 to 128 characters', met: password.length >= 12 && password.length <= 128 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
    { label: 'Does not contain your email', met: !containsEmail }
  ];
}

export function getPasswordErrors(password: string, email: string): string[] {
  return getPasswordRules(password, email)
    .filter((rule) => !rule.met)
    .map((rule) => rule.label);
}

export function getPasswordStrengthLabel(score: number): string {
  if (score <= 2) return 'Weak';
  if (score <= 4) return 'Medium';
  if (score === 5) return 'Strong';
  return 'Very strong';
}

// Input Sanitization Utilities

export function cleanClientText(value: string | null, maxLength = 120): string {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}


export function cleanSearchText(value: string): string {
  return cleanClientText(value, 80);
}

// Input Validation 

export function isValidName(value: string): boolean {
  return /^[A-Za-z\s'.-]{2,80}$/.test(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

export function isValidPhone(value: string): boolean {
  return /^\+?[0-9\s-]{7,20}$/.test(value);
}

export function isValidRoom(value: string): boolean {
  return /^[A-Za-z0-9\s-]{1,20}$/.test(value);
}
