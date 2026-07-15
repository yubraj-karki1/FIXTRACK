// Forgot Password Page
// Two-step self-service password reset: request a code, then submit the code with a new password.

'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { Input, AuthShell } from '../shared/UIComponents';
import { getPasswordErrors } from '../utils/helpers';
import { PasswordStrengthFeedback } from './PasswordStrengthFeedback';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const submittedEmail = String(new FormData(event.currentTarget).get('email-address') || '').toLowerCase();
    setEmail(submittedEmail);

    try {
      await api.forgotPassword(submittedEmail);
      setInfo('If an account exists for that email, a reset code has been sent.');
      setStep('reset');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to request a reset code.');
    }
  };

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const code = String(data.get('code') || '').trim();
    const newPassword = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirm-password') || '');
    const passwordErrors = getPasswordErrors(newPassword, email);

    if (passwordErrors.length) {
      setError(`Password requirements missing: ${passwordErrors.join(', ')}.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await api.resetPassword(email, code, newPassword);
      setStep('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset your password.');
    }
  };

  if (step === 'done') {
    return (
      <AuthShell title="Password reset" subtitle="Your password has been changed successfully.">
        <p className="form-help">
          <a href="/login">Continue to login</a>
        </p>
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return (
      <AuthShell title="Enter reset code" subtitle={`Enter the 6-digit code sent for ${email} and choose a new password.`}>
        <form className="form" onSubmit={resetPassword}>
          {error && <p className="validation">{error}</p>}
          {info && !error && <p className="form-help">{info}</p>}
          <Input
            name="code"
            label="Reset code"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            required
          />
          <Input
            name="password"
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter a new password"
            required
          />
          <Input name="confirm-password" label="Confirm new password" type="password" placeholder="Re-enter your new password" required />
          <PasswordStrengthFeedback password={password} email={email} />
          <button className="button button-primary full" type="submit">
            Reset password
          </button>
          <p className="form-help">
            Didn&apos;t get a code? <a href="/forgot-password">Request a new one</a>
          </p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password" subtitle="Enter your account email and we'll send you a reset code.">
      <form className="form" onSubmit={requestCode}>
        {error && <p className="validation">{error}</p>}
        <Input name="email-address" label="Email address" type="email" placeholder="student@hostel.edu" required />
        <button className="button button-primary full" type="submit">
          Send reset code
        </button>
        <p className="form-help">
          <a href="/login">Back to login</a>
        </p>
      </form>
    </AuthShell>
  );
}
