/**
 * Password Strength Feedback Component
 * Shows visual feedback on password requirements met/unmet
 */

import { getPasswordRules, getPasswordStrengthLabel } from '../utils/helpers';

export function PasswordStrengthFeedback({ password, email }: { password: string; email: string }) {
  const rules = getPasswordRules(password, email);
  const score = rules.filter((rule) => rule.met).length;
  const strengthLabel = getPasswordStrengthLabel(score);

  return (
    <div className="password-strength span-2" aria-live="polite">
      <div className="strength-summary">
        <span>Password strength</span>
        <strong>{password ? strengthLabel : 'Not started'}</strong>
      </div>
      <div className="strength-meter" aria-hidden="true">
        <span style={{ width: `${(score / rules.length) * 100}%` }} />
      </div>
      <div className="password-rules">
        {rules.map((rule) => (
          <span key={rule.label} className={rule.met ? 'met' : ''}>
            {rule.met ? 'OK' : '-'} {rule.label}
          </span>
        ))}
      </div>
    </div>
  );
}
