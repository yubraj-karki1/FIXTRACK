/**
 * Utility Functions and Helper Methods
 * Shared utilities for authentication, validation, and data manipulation
 */

import type { User } from '@/types';

// ============== Dashboard Routing ==============

/**
 * Determines the appropriate dashboard path based on user role
 * Routes admins to /admin, staff to /staff, and students to /student
 */
export function getDashboardPath(userOrEmail: User | string): string {
  const role = typeof userOrEmail === 'string' ? '' : userOrEmail.role;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email).toLowerCase();

  if (isAdminUser(userOrEmail)) return '/admin';
  if (role === 'Maintenance Staff' || email.includes('staff') || email.includes('maintenance') 
    || email.includes('ramesh') || email.includes('mina')) return '/staff';
  return '/student';
}

/**
 * Checks if a user has administrator privileges
 * Returns true if user role is 'Administrator' or email contains 'admin'
 */
export function isAdminUser(userOrEmail?: User | string): boolean {
  if (!userOrEmail) return false;

  const role = typeof userOrEmail === 'string' ? '' : userOrEmail.role;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email).toLowerCase();
  return role === 'Administrator' || email.includes('admin');
}

/**
 * Checks if a path is restricted to admin users only
 */
export function isAdminOnlyPath(path?: string | null): boolean {
  return !!path && (path === '/complaints/new' || path === '/admin' || path.startsWith('/admin/'));
}

/**
 * Determines the redirect destination after login
 * Returns the requested path if allowed for the user's role, otherwise routes to default dashboard
 */
export function getLoginTarget(requestedNext: string | null, userOrEmail: User | string): string {
  // Reject protocol-relative/external targets supplied through the query string.
  const isSafeInternalPath = requestedNext?.startsWith('/') && !requestedNext.startsWith('//');
  if (requestedNext && isSafeInternalPath && (!isAdminOnlyPath(requestedNext) || isAdminUser(userOrEmail))) {
    return requestedNext;
  }

  return getDashboardPath(userOrEmail);
}

// ============== Password Validation ==============

/**
 * Password validation rules interface
 */
export interface PasswordRule {
  label: string;
  met: boolean;
}

/**
 * Validates password against security rules and returns compliance status for each rule
 * Rules: length (8-20), uppercase, lowercase, number, special character, no email
 */
export function getPasswordRules(password: string, email: string): PasswordRule[] {
  const normalizedPassword = password.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const emailName = normalizedEmail.split('@')[0] || '';
  const containsEmail =
    Boolean(normalizedEmail && normalizedPassword.includes(normalizedEmail)) ||
    Boolean(emailName.length >= 3 && normalizedPassword.includes(emailName));

  return [
    { label: '8 to 20 characters', met: password.length >= 8 && password.length <= 20 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
    { label: 'Does not contain your email', met: !containsEmail }
  ];
}

/**
 * Returns list of failed password validation rules as human-readable error messages
 */
export function getPasswordErrors(password: string, email: string): string[] {
  return getPasswordRules(password, email)
    .filter((rule) => !rule.met)
    .map((rule) => rule.label);
}

/**
 * Converts password strength score (0-6) to user-friendly label
 */
export function getPasswordStrengthLabel(score: number): string {
  if (score <= 2) return 'Weak';
  if (score <= 4) return 'Medium';
  if (score === 5) return 'Strong';
  return 'Very strong';
}

// ============== Input Sanitization ==============

/**
 * Sanitizes client-side text input by removing HTML tags, control characters,
 * and trimming to specified length. Prevents XSS attacks.
 */
export function cleanClientText(value: string | null, maxLength = 120): string {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes search input text with a shorter character limit for search queries
 */
export function cleanSearchText(value: string): string {
  return cleanClientText(value, 80);
}

// ============== Input Validation ==============

/**
 * Input validation utilities for form fields
 * Validates name, email, phone number, and room number formats
 */
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
