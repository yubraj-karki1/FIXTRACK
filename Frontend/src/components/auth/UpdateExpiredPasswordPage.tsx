// Update Expired Password Page
// Shown after login when the account's password has passed the policy's max age.
// Authenticated by the server's short-lived pending-password-change cookie, not a full session.

'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFixTrack } from '@/context/FixTrackContext';
import { api } from '@/lib/api';
import { Input, AuthShell } from '../shared/UIComponents';
import { getLoginTarget, getPasswordErrors } from '../utils/helpers';
import { PasswordStrengthFeedback } from './PasswordStrengthFeedback';

export function UpdateExpiredPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, refreshAuth } = useFixTrack();
  const userId = searchParams.get('userId') || '';
  const next = searchParams.get('next');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!userId) {
      setError('Your password update session expired. Please sign in again.');
      return;
    }

    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirm-password') || '');
    const passwordErrors = getPasswordErrors(newPassword, '');

    if (passwordErrors.length) {
      setError(`Password requirements missing: ${passwordErrors.join(', ')}.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await api.changeExpiredPassword(userId, newPassword);
      const user = await refreshAuth();
      if (!user) {
        throw new Error('Password updated, but the session could not be refreshed.');
      }
      notify('Password updated. You are now logged in.');
      router.replace(getLoginTarget(next, user));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update your password.');
    }
  };

  return (
    <AuthShell title="Update your password" subtitle="Your password has expired. Choose a new one to continue.">
      <form className="form" onSubmit={submit}>
        {error && <p className="validation">{error}</p>}
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
        <PasswordStrengthFeedback password={password} email="" />
        <button className="button button-primary full" type="submit">
          Update password
        </button>
        <p className="form-help">
          <a href="/login">Back to login</a>
        </p>
      </form>
    </AuthShell>
  );
}
