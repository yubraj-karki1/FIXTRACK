//Student Account Registration Page
//Collects student details (name, ID, email, phone, building, room) and creates new account
//Validates password strength and shows real-time feedback

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFixTrack } from '@/context/FixTrackContext';
import { buildings } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import { Input, Select } from '../shared/UIComponents';
import { AuthShell } from '../shared/UIComponents';
import { getPasswordErrors } from '../utils/helpers';
import { PasswordStrengthFeedback } from './PasswordStrengthFeedback';

export function RegisterPage() {
  const router = useRouter();
  const { notify, setCurrentUser } = useFixTrack();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      const user = await api.register({
        name: String(data.get('full-name') || 'New Student'),
        studentId: String(data.get('student-id') || ''),
        email: emailAddress,
        password,
        phone: String(data.get('phone-number') || ''),
        building: String(data.get('hostel-building') || buildings[0]),
        room: String(data.get('room-number') || '')
      });

      setCurrentUser({ ...user, photo: '' });
      notify('Account created successfully.');
      router.push('/student');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create account.');
    }
  };

  return (
    <AuthShell title="Create student account" subtitle="Register your hostel details to report and track maintenance issues.">
      <form className="form two-col" onSubmit={handleRegister}>
        {error && <p className="validation span-2">{error}</p>}
        <Input label="Full name" required />
        <Input label="Student ID" placeholder="STU-2026-014" required />
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input label="Phone number" required />
        <Select label="Hostel building" options={buildings.slice(0, 4)} />
        <Input label="Room number" required />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Input label="Confirm password" type="password" required />
        <PasswordStrengthFeedback password={password} email={email} />
        <button className="button button-primary full span-2" type="submit">
          Register
        </button>
        <p className="form-help span-2">
          Already have an account? <a href="/login">Login</a>
        </p>
      </form>
    </AuthShell>
  );
}
