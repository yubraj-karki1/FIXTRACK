/**
 * Reusable UI Components
 * Input fields, Select dropdowns, Badges, and other common UI elements
 */

import Link from 'next/link';
import { Archive, Wrench } from 'lucide-react';
import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  compact?: boolean;
}

export function Input({ label, name, compact, ...props }: InputProps) {
  return (
    <label className={`field ${compact ? 'compact-field' : ''}`}>
      {label}
      <input name={name || label.toLowerCase().replaceAll(' ', '-')} {...props} />
    </label>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly string[];
  compact?: boolean;
}

export function Select({ label, name, options, compact, ...props }: SelectProps) {
  return (
    <label className={`field ${compact ? 'compact-field' : ''}`}>
      {label}
      <select name={name || label.toLowerCase().replaceAll(' ', '-')} {...props}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export function Badge({ label, type }: { label: string; type?: 'priority' }) {
  const cls = `badge ${type === 'priority' ? `priority-${label.toLowerCase()}` : `status-${label.toLowerCase().replaceAll(' ', '-')}`}`;
  return <span className={cls}>{label}</span>;
}

interface PageHeaderProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Panel({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <section className="panel">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function AuthShell({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <main className="auth-page" id="main-content">
      <Link className="brand" href="/">
        <Wrench /> FixTrack
      </Link>
      <section className="auth-card">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  );
}

export function EmptyState({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${compact ? 'compact-empty' : ''}`}>
      <Archive />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
