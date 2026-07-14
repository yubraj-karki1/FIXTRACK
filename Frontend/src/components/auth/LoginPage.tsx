// Login Page Component
// Email/password authentication with TOTP support
// Handles redirects based on user role and requested destination
 

'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFixTrack } from '@/context/FixTrackContext';
import { users } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import { Input } from '../shared/UIComponents';
import { AuthShell } from '../shared/UIComponents';
import { getLoginTarget } from '../utils/helpers';

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, refreshAuth } = useFixTrack();
  const [error, setError] = useState('');
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email-address') || '').toLowerCase();
    const password = String(data.get('password') || '');
    const requestedNext = searchParams.get('next');

    try {
      const login = await api.login(email, password);
      const matchedUser = users.find((user) => user.email.toLowerCase() === email);
      const loginUser = login.user || matchedUser || email;
      const target = getLoginTarget(requestedNext, loginUser);

      if (login.requiresTotp && login.userId) {
        // The final session remains unavailable until the authenticator code is verified.
        notify('Enter your authenticator code to finish login.');
        router.push(`/totp?userId=${login.userId}&next=${encodeURIComponent(target)}`);
        return;
      }

      // Re-read the backend session instead of trusting profile data from the login response.
      const authenticatedUser = await refreshAuth();
      if (!authenticatedUser) {
        throw new Error('Login succeeded, but the authentication session could not be refreshed.');
      }

      notify('Logged in successfully.');
      router.replace(getLoginTarget(requestedNext, authenticatedUser));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to log in.');
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue tracking hostel maintenance requests.">
      <form className="form" onSubmit={handleLogin}>
        {error && <p className="validation">{error}</p>}
        <Input label="Email address" type="email" placeholder="student@hostel.edu" required />
        <Input label="Password" type="password" name="password" placeholder="Enter your password" required />
        <div className="form-row compact">
          <label className="check">
            <input type="checkbox" /> Remember me
          </label>
          <a href="/login">Forgot password?</a>
        </div>
        <button className="button button-primary full" type="submit">
          Login
        </button>
        <p className="form-help">
          No account yet? <a href="/register">Create an account</a>
        </p>
      </form>
    </AuthShell>
  );
}
