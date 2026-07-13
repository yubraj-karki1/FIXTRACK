/**
 * TOTP (Two-Factor Authentication) Login Page
 * Allows users with TOTP enabled to enter their 6-digit authenticator code
 */

'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFixTrack } from '@/context/FixTrackContext';
import { api } from '@/lib/api';
import { Input } from '../shared/UIComponents';
import { AuthShell } from '../shared/UIComponents';
import { getLoginTarget, rememberTotpUser } from '../utils/helpers';

export function TotpLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, setCurrentUser } = useFixTrack();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const userId = searchParams.get('userId') || '';
  const next = searchParams.get('next') || '/student';

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      const user = await api.verifyTotpLogin(userId, token);
      setCurrentUser({ ...user, photo: '' });
      rememberTotpUser({ ...user, totpEnabled: true });
      notify('Two-factor authentication verified.');
      router.push(getLoginTarget(next, user));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid authenticator code.');
    }
  };

  return (
    <AuthShell title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app.">
      <form className="form" onSubmit={verify}>
        {error && <p className="validation">{error}</p>}
        <Input
          label="Authenticator code"
          inputMode="numeric"
          maxLength={6}
          value={token}
          onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          required
        />
        <button className="button button-primary full" type="submit">
          Verify and continue
        </button>
        <p className="form-help">
          <a href="/login">Back to login</a>
        </p>
      </form>
    </AuthShell>
  );
}
