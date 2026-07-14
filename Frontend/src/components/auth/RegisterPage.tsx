//Student Account Registration Page
//Collects student details (name, ID, email, phone, building, room) and creates new account
//Validates password strength and shows real-time feedback

'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFixTrack } from '@/context/FixTrackContext';
import { buildings } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import { Input, Select } from '../shared/UIComponents';
import { AuthShell } from '../shared/UIComponents';
import { getLoginTarget, getPasswordErrors } from '../utils/helpers';
import { PasswordStrengthFeedback } from './PasswordStrengthFeedback';

export function RegisterPage() {
  const router = useRouter();
  const { notify, refreshAuth } = useFixTrack();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const emailAddress = String(data.get('email-address') || '').toLowerCase();
    const password = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirm-password') || '');
    const passwordErrors = getPasswordErrors(password, emailAddress);

    if (passwordErrors.length) {
      setError(`Password requirements missing: ${passwordErrors.join(', ')}.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      // The backend creates the account and writes a secure session cookie in one response.
      await api.register({
        name: String(data.get('full-name') || 'New Student'),
        studentId: String(data.get('student-id') || ''),
        email: emailAddress,
        password,
        phone: String(data.get('phone-number') || ''),
        building: String(data.get('hostel-building') || buildings[0]),
        room: String(data.get('room-number') || '')
      });

      // Load the safe server-side user record before entering the protected dashboard.
      const user = await refreshAuth();
      if (!user) {
        throw new Error('Account created, but the authentication session could not be refreshed.');
      }
      notify('Account created successfully.');
      router.replace(getLoginTarget(null, user));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create account.');
    }
  };

  return (
    <AuthShell title="Create student account" subtitle="Register your hostel details to report and track maintenance issues.">
      <form className="form two-col" ref={formRef} onSubmit={handleRegister}>
        {error && <p className="validation span-2">{error}</p>}
        <Input name="full-name" label="Full name" required />
        <Input name="student-id" label="Student ID" placeholder="STU-2026-014" required />
        <Input
          name="email-address"
          label="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input name="phone-number" label="Phone number" required />
        <Select name="hostel-building" label="Hostel building" options={buildings.slice(0, 4)} />
        <Input name="room-number" label="Room number" required />
        <Input
          name="password"
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Input name="confirm-password" label="Confirm password" type="password" required />
        <PasswordStrengthFeedback password={password} email={email} />
        <button
          className="button button-primary full span-2"
          type="button"
          onClick={async () => {
            if (!formRef.current) return;
            await handleRegister({ currentTarget: formRef.current, preventDefault: () => {} } as unknown as FormEvent<HTMLFormElement>);
          }}
        >
          Register
        </button>
        <p className="form-help span-2">
          Already have an account? <a href="/login">Login</a>
        </p>
      </form>
    </AuthShell>
  );
}
