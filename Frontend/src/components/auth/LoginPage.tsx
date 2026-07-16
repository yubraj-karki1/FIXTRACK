// Login Page Component
// Email/password authentication with TOTP support
// Handles redirects based on user role and requested destination
 

'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFixTrack } from '@/context/FixTrackContext';
import { api } from '@/lib/api';
import { Input } from '../shared/UIComponents';
import { AuthShell } from '../shared/UIComponents';
import { getLoginTarget } from '../utils/helpers';

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, refreshAuth } = useFixTrack();
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);
  async function submitForm(form?: HTMLFormElement | null) {
    setError('');
    const f = form ?? formRef.current;
    if (!f) return;
    const data = new FormData(f);
    const email = String(data.get('email-address') || '').toLowerCase();
    const password = String(data.get('password') || '');
    const requestedNext = searchParams.get('next');

    try {
      const login = await api.login(email, password);
      const loginUser = login.user || email;
      const target = getLoginTarget(requestedNext, loginUser);

      if (login.requiresPasswordChange && login.userId) {
        notify('Your password has expired. Please choose a new one.');
        router.push(`/update-password?userId=${login.userId}&next=${encodeURIComponent(target)}`);
        return;
      }

      if (login.requiresTotp && login.userId) {
        notify('Enter your authenticator code to finish login.');
        router.push(`/totp?userId=${login.userId}&next=${encodeURIComponent(target)}`);
        return;
      }

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
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitForm(event.currentTarget as HTMLFormElement);
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue tracking hostel maintenance requests.">
      <form className="form" ref={formRef} onSubmit={handleLogin}>
        {error && <p className="validation">{error}</p>}
        <Input name="email-address" label="Email address" type="email" placeholder="student@hostel.edu" required />
        <Input label="Password" type="password" name="password" placeholder="Enter your password" required />
        <div className="form-row compact">
          <label className="check">
            <input type="checkbox" /> Remember me
          </label>
          <a href="/forgot-password">Forgot password?</a>
        </div>
        <button
          className="button button-primary full"
          type="button"
          onClick={async () => await submitForm()}
        >
          Login
        </button>
        <p className="form-help">
          No account yet? <a href="/register">Create an account</a>
        </p>
      </form>
    </AuthShell>
  );
}
