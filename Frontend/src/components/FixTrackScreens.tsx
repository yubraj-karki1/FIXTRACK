//FixTrack Frontend Components
//Main component file containing all page layouts, forms, and UI components for the hostel
//maintenance complaint tracking system. Includes student dashboard, complaint management,
//staff workflow, admin panels, and authentication pages.

'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bath,
  Bolt,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  Droplets,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sofa,
  Sparkles,
  Sun,
  UserCog,
  Users,
  Wrench,
  X,
  Wifi
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormEvent, InputHTMLAttributes, PropsWithChildren, ReactNode, SelectHTMLAttributes } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useFixTrack } from '@/context/FixTrackContext';
import { aggregate, initials, makeStatusStats } from '@/data/helpers';
import { buildings, categories, priorities, statuses } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import type {
  AuditEvent,
  AuditEventType,
  ChartDatum,
  Complaint,
  ComplaintCategoryName,
  ComplaintPriority,
  ComplaintStatus,
  IconCategory,
  User
} from '@/types';

const categoryIcons: Record<ComplaintCategoryName, LucideIcon> = {
  Water: Droplets,
  Electricity: Bolt,
  'Wi-Fi': Wifi,
  Bathroom: Bath,
  'Door/Lock': DoorOpen,
  Furniture: Sofa,
  Cleaning: Sparkles,
  Other: Wrench
};

const iconCategories: IconCategory[] = categories.map((category) => ({
  ...category,
  icon: categoryIcons[category.name]
}));


// Determines the default landing page after login. Admin access is still allowed,
// but admins should not be forced into the admin dashboard on every login.

function getDashboardPath(userOrEmail: User | string): string {
  const role = typeof userOrEmail === 'string' ? '' : userOrEmail.role;

  if (role === 'Maintenance Staff') return '/staff';
  return '/student';
}
 
function isAdminUser(userOrEmail?: User | string): boolean {
  if (!userOrEmail) return false;

  return typeof userOrEmail !== 'string' && userOrEmail.role === 'Administrator';
}

function isAdminOnlyPath(path?: string | null): boolean {
  return !!path && (path === '/admin' || path.startsWith('/admin/'));
}

function getLoginTarget(requestedNext: string | null, userOrEmail: User | string): string {
  // Only allow local application paths; never turn a login `next` value into an open redirect.
  const isSafeInternalPath = requestedNext?.startsWith('/') && !requestedNext.startsWith('//');
  if (requestedNext && isSafeInternalPath && (!isAdminOnlyPath(requestedNext) || isAdminUser(userOrEmail))) {
    return requestedNext;
  }

  return getDashboardPath(userOrEmail);
}

interface PasswordRule {
  label: string;
  met: boolean;
}


// Validates password against security rules and returns compliance status for each rule
// Rules: length (8-20), uppercase, lowercase, number, special character, no email
 
function getPasswordRules(password: string, email: string): PasswordRule[] {
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

function getPasswordErrors(password: string, email: string): string[] {
  return getPasswordRules(password, email)
    .filter((rule) => !rule.met)
    .map((rule) => rule.label);
}


// Converts password strength score (0-6) to user-friendly label

function getPasswordStrengthLabel(score: number): string {
  if (score <= 2) return 'Weak';
  if (score <= 4) return 'Medium';
  if (score === 5) return 'Strong';
  return 'Very strong';
}

//Sanitizes client-side text input by removing HTML tags, control characters,
//and trimming to specified length. Prevents XSS attacks.

function cleanClientText(value: FormDataEntryValue | string | null, maxLength = 120): string {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function cleanSearchText(value: string): string {
  return cleanClientText(value, 80);
}

function isValidName(value: string): boolean {
  return /^[A-Za-z\s'.-]{2,80}$/.test(value);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function isValidPhone(value: string): boolean {
  return /^\+?[0-9\s-]{7,20}$/.test(value);
}

function isValidRoom(value: string): boolean {
  return /^[A-Za-z0-9\s-]{1,20}$/.test(value);
}

interface StatItem {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: string;
}

interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  compact?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly string[];
  compact?: boolean;
}

export function LandingPage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <Wrench /> FixTrack
        </Link>
        <div>
          <Link href="/login">Login</Link>
          <Link className="button button-primary" href="/register">
            Create Account
          </Link>
        </div>
      </nav>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Hostel maintenance reporting</span>
          <h1>Report Hostel Problems Easily</h1>
          <p>
            FixTrack helps students submit repair requests with evidence, track live progress, and keep maintenance teams
            organized from assignment to resolution.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login">
              <LogIn /> Login
            </Link>
            <Link className="button button-secondary" href="/login?next=%2Fcomplaints">
              <Search /> Track Your Complaint
            </Link>
          </div>
        </div>
        <div className="hero-panel" aria-label="Maintenance summary preview">
          <div className="hero-panel-top">
            <span>Today</span>
            <strong>24 reports monitored</strong>
          </div>
          <div className="repair-card urgent">
            <AlertTriangle />
            <div>
              <strong>Emergency lock issue</strong>
              <span>Cedar Block, Room 120</span>
            </div>
          </div>
          <div className="repair-card">
            <Droplets />
            <div>
              <strong>Leak repair in progress</strong>
              <span>Maple Hall, Room 204</span>
            </div>
          </div>
          <div className="mini-progress">
            <span style={{ width: '72%' }} />
          </div>
          <p className="muted">Staff workload, building summaries, and student updates stay in one shared dashboard.</p>
        </div>
      </section>
      <section className="feature-grid">
        <FeatureCard icon={FileText} title="Fast reporting" text="Students can submit detailed complaints with category, room, priority, and description." />
        <FeatureCard icon={Activity} title="Live status updates" text="Clear badges and timelines show every step from pending to closed." />
        <FeatureCard icon={FileText} title="Detailed reports" text="Structured repair details help staff understand the problem before visiting the room." />
        <FeatureCard icon={Users} title="Staff management" text="Admins can assign work, monitor load, and filter repairs by role or building." />
      </section>
      <footer className="footer">
        <span>FixTrack Hostel Maintenance</span>
        <span>support@fixtrack.edu</span>
        <span>Quick links: Reports, Dashboard, Profile</span>
      </footer>
    </main>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="feature-card">
      <Icon />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function AuthShell({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <main className="auth-page">
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

// Two-factor authentication verification page
// Allows users with TOTP enabled to enter their 6-digit authenticator code
 
export function TotpLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, refreshAuth } = useFixTrack();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const userId = searchParams.get('userId') || '';
  const next = searchParams.get('next');

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      // This endpoint replaces the challenge cookie with the final HttpOnly session cookie.
      await api.verifyTotpLogin(userId, token);
      const user = await refreshAuth();
      if (!user) {
        throw new Error('Two-factor verification succeeded, but the session could not be refreshed.');
      }
      notify('Two-factor authentication verified.');
      router.replace(getLoginTarget(next, user));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid authenticator code.');
    }
  };
  return (
    <AuthShell title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app.">
      <form className="form" onSubmit={verify}>
        {error && <p className="validation">{error}</p>}
        <Input label="Authenticator code" inputMode="numeric" maxLength={6} value={token} 
        onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required />
        <button className="button button-primary full" type="submit">
          Verify and continue
        </button>
        <p className="form-help">
          <Link href="/login">Back to login</Link>
        </p>
      </form>
    </AuthShell>
  );
}

// Student account registration page
// Collects student details (name, ID, email, phone, building, room) and creates new account
// Validates password strength and shows real-time feedback.

export function RegisterPage() {
  const router = useRouter();
  const { notify, refreshAuth } = useFixTrack();
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
      // Registration keeps the previous auto-login experience, now backed by a real session cookie.
      await api.register({
        name: String(data.get('full-name') || 'New Student'),
        studentId: String(data.get('student-id') || ''),
        email: emailAddress,
        password,
        phone: String(data.get('phone-number') || ''),
        building: String(data.get('hostel-building') || buildings[0]),
        room: String(data.get('room-number') || '')
      });

      // Registration now creates the same server session as login.
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
      <form className="form two-col" onSubmit={handleRegister}>
        {error && <p className="validation span-2">{error}</p>}
        <Input label="Full name" required />
        <Input label="Student ID" placeholder="STU-2026-014" required />
        <Input label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Input label="Phone number" required />
        <Select label="Hostel building" options={buildings.slice(0, 4)} />
        <Input label="Room number" required />
        <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Input label="Confirm password" type="password" required />
        <PasswordStrengthFeedback password={password} email={email} />
        <button className="button button-primary full span-2" type="submit">
          Register
        </button>
        <p className="form-help span-2">
          Already have an account? <Link href="/login">Login</Link>
        </p>
      </form>
    </AuthShell>
  );
}
function PasswordStrengthFeedback({ password, email }: { password: string; email: string }) {
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

export function DashboardLayout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, authStatus, logout, notify, theme, toggleTheme } = useFixTrack();
  const isAdmin = isAdminUser(currentUser);
  const nav: Array<[string, string, LucideIcon, boolean?]> = [
    ['Student', '/student', LayoutDashboard],
    ['My Complaints', '/complaints', ClipboardCheck],
    ['Staff', '/staff', BriefcaseBusiness],
    ['New Complaint', '/complaints/new', Plus],
    ['Admin', '/admin', UserCog, true],
    ['Manage Reports', '/admin/complaints', Archive, true],
    ['Users', '/admin/users', Users, true],
    ['Activity Log', '/admin/activity', Activity, true],
    ['Profile', '/profile', Settings]
  ];
  const visibleNav = nav.filter(([label, , , adminOnly]) =>
    (!adminOnly || isAdmin) &&
    (label !== 'Staff' || currentUser.role === 'Maintenance Staff' || isAdmin) &&
    (label !== 'New Complaint' || currentUser.role === 'Student') &&
    // Administrators manage complaints and users through the admin pages, not the student views.
    (!isAdmin || (label !== 'Student' && label !== 'My Complaints'))
  );

  useEffect(() => {
    // Client-side protection avoids rendering dashboard content during an unauthenticated visit.
    if (authStatus === 'unauthenticated') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authStatus, pathname, router]);

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      // The server expires HttpOnly cookies; JavaScript cannot clear them directly.
      await logout();
      notify('Logged out successfully.');
      router.replace('/login');
      router.refresh();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to log out.');
    }
  };

  // Do not render protected content until /auth/me has verified the cookie.
  if (authStatus !== 'authenticated') {
    return <main className="auth-page"><p>Checking authentication...</p></main>;
  }

  return (
    <div className="dashboard-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          <Link className="brand" href="/">
            <Wrench /> FixTrack
          </Link>
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </button>
        </div>
        <nav>
          {visibleNav.map(([label, href, Icon]) => (
            <Link key={href} className={pathname === href ? 'active' : ''} href={href} onClick={() => setOpen(false)}>
              <Icon /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <span className="avatar">{initials(currentUser.name)}</span>
            <button className="button button-secondary logout-button" type="button" onClick={() => setShowLogoutConfirm(true)}>
              <LogOut /> Logout
            </button>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
      {showLogoutConfirm && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
            <h2 id="logout-title">Logout?</h2>
            <p>Are you sure you want to logout from FixTrack?</p>
            <div className="confirm-actions">
              <button className="button button-danger" type="button" onClick={confirmLogout}>
                Yes, logout
              </button>
              <button className="button button-secondary" type="button" onClick={() => setShowLogoutConfirm(false)}>
                No, stay
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AdminOnlyGate({
  title,
  description,
  children
}: PropsWithChildren<{ title: string; description: string }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser } = useFixTrack();
  const isAdmin = isAdminUser(currentUser);

  useEffect(() => {
    if (!isAdmin) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAdmin, pathname, router]);

  if (!isAdmin) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <Panel>
          <EmptyState title="Admin login required" text="Only administrators can access this panel." />
        </Panel>
      </>
    );
  }

  return <>{children}</>;
}

export function StudentDashboardPage() {
  const { complaints, currentUser } = useFixTrack();
  const mine = complaints.filter((complaint) => complaint.studentUserId === currentUser.id);
  const stats = makeStatusStats(mine);

  return (
    <>
      <PageHeader title={`Welcome, ${currentUser.name.split(' ')[0] || 'Student'}`} description="Track your hostel repairs and follow maintenance updates in a few clicks." action={<Link className="button button-primary" href="/complaints"><ClipboardCheck /> My Complaints</Link>} />
      <StatsGrid
        stats={[
          { label: 'Total complaints', value: mine.length, icon: FileText },
          { label: 'Pending complaints', value: stats.Pending || 0, icon: Clock3, tone: 'pending' },
          { label: 'In-progress complaints', value: stats['In Progress'] || 0, icon: Activity, tone: 'active' },
          { label: 'Resolved complaints', value: (stats.Resolved || 0) + (stats.Closed || 0), icon: CheckCircle2, tone: 'resolved' }
        ]}
      />
      <section className="category-strip">
        {iconCategories.map(({ name, icon: Icon }) => (
          <Link href="/complaints" key={name}>
            <Icon />
            {name}
          </Link>
        ))}
      </section>
      <div className="content-grid">
        <Panel title="Recent complaints">
          <ComplaintList complaints={mine.slice(0, 4)} />
        </Panel>
        <Panel title="Complaint status timeline">
          <Timeline status="In Progress" />
        </Panel>
      </div>
    </>
  );
}

export function CreateComplaintPage() {
  const router = useRouter();
  const { complaints, setComplaints, notify, currentUser } = useFixTrack();
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    const description = String(data.get('description') || '').trim();
    const room = String(data.get('room') || '').trim();

    if (title.length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }

    if (description.length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }

    if (!/^[A-Za-z0-9\s-]+$/.test(room)) {
      setError('Room number can only contain letters, numbers, spaces, and hyphens.');
      return;
    }

    try {
      const created = await api.createComplaint({
        title,
        category: data.get('category') as ComplaintCategoryName,
        priority: data.get('priority') as ComplaintPriority,
        building: String(data.get('building')),
        room,
        description
      });
      setComplaints([created, ...complaints]);
      notify('Complaint submitted successfully.');
      router.push('/complaints');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit complaint.');
    }
  };
  return (
    <>
      <PageHeader title="Create complaint" description="Add the details maintenance staff need to inspect and resolve the issue." />
      <Panel>
        <form className="form complaint-form" onSubmit={submit}>
          {error && <p className="validation">{error}</p>}
          <Input label="Complaint title" name="title" placeholder="Example: Ceiling water leakage" required />
          <Select label="Complaint category" name="category" options={categories.map((category) => category.name)} />
          <label className="field span-2">
            Description
            <textarea name="description" rows={5} placeholder="Describe the problem, when it started, and any safety concerns." required />
          </label>
          <Select label="Building" name="building" options={buildings.slice(0, 4)} defaultValue={currentUser.building} />
          <Input label="Room number" name="room" placeholder={currentUser.room || '204'} defaultValue={currentUser.room} required />
          <PrioritySelector />
          <button className="button button-primary span-2" type="submit">
            Submit complaint
          </button>
        </form>
      </Panel>
    </>
  );
}


export function MyComplaintsPage() {
  const { complaints, currentUser } = useFixTrack();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ComplaintStatus | 'All'>('All');
  const [category, setCategory] = useState<ComplaintCategoryName | 'All'>('All');
  const myComplaints = complaints.filter((complaint) => complaint.studentUserId === currentUser.id);
  const filtered = myComplaints.filter(
    (complaint) =>
      (status === 'All' || complaint.status === status) &&
      (category === 'All' || complaint.category === category) &&
      `${complaint.id} ${complaint.title} ${complaint.category}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <PageHeader title="My complaints" description="Search, filter, and open your submitted maintenance reports." />
      <FilterBar query={query} setQuery={setQuery} status={status} setStatus={setStatus} category={category} setCategory={setCategory} />
      {filtered.length ? <ComplaintTable complaints={filtered} /> : <EmptyState title="No complaints found" text="Try a different search or create a new report." />}
    </>
  );
}


export function ComplaintDetailPage({ id }: { id: string }) {
  const { complaints, setComplaints, notify, currentUser } = useFixTrack();
  const complaint = complaints.find((item) => item.id === id);
  if (!complaint) {
    return <EmptyState title="Complaint not found" text="This complaint does not exist or you do not have access to it." />;
  }
  const canEdit = currentUser.role === 'Student' && complaint.studentUserId === currentUser.id && complaint.status === 'Pending';

  const cancel = async () => {
    try {
      const updated = await api.updateComplaint(complaint.id, { status: 'Closed' });
      setComplaints(complaints.map((item) => item.id === updated.id ? updated : item));
      notify('Complaint cancelled.');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to cancel complaint.');
    }
  };

  return (
    <>
      <PageHeader title={complaint.title} description={`${complaint.id} • ${complaint.building}, Room ${complaint.room}`} action={canEdit && <button className="button button-danger" onClick={cancel}>Cancel complaint</button>} />
      <section className="detail-grid">
        <Panel title="Complaint details">
          <div className="detail-meta">
            <Badge label={complaint.category} />
            <Badge label={complaint.priority} type="priority" />
            <Badge label={complaint.status} />
          </div>
          <p>{complaint.description}</p>
          {currentUser.role !== 'Student' && (
            <p className="muted">
              Submitted by{' '}
              {currentUser.role === 'Administrator' ? (
                <Link href={`/admin/users/${complaint.studentUserId}`}>{complaint.student}</Link>
              ) : (
                complaint.student
              )}
              {complaint.studentPhone ? ` • ${complaint.studentPhone}` : ''}
            </p>
          )}
          <img className="detail-image" src={complaint.image} alt={`${complaint.title} evidence`} />
        </Panel>
        <Panel title="Status progress">
          <Timeline status={complaint.status} />
        </Panel>
        <Panel title="Repair notes">
          {complaint.notes.length ? complaint.notes.map((note) => <div className="note" key={note}>{note}</div>) : <EmptyState title="No repair notes yet" text="Staff notes will appear after assignment." compact />}
          {canEdit && (
            <button className="button button-secondary">
              <FileText /> Edit pending complaint
            </button>
          )}
        </Panel>
      </section>
    </>
  );
}


export function StaffDashboardPage() {
  const { complaints, setComplaints, notify } = useFixTrack();
  // Administrators can also open this page and see every complaint, so "assigned" must be
  // filtered on staffUserId directly rather than just excluding Closed items — otherwise
  // unassigned, still-Pending complaints show up here with Start/Resolve controls that can
  // never legally be used yet.
  const assigned = complaints.filter((complaint) => complaint.status !== 'Closed' && complaint.staffUserId);
  // Visible to every staff member (read-only) so they can see what's waiting for an
  // administrator to assign; only an administrator can actually assign it to someone.
  const pendingQueue = complaints.filter((complaint) => complaint.status === 'Pending');

  const updateStatus = async (id: string, status: ComplaintStatus) => {
    try {
      const updated = await api.updateComplaint(id, { status });
      setComplaints(complaints.map((complaint) => complaint.id === id ? updated : complaint));
      notify(`Complaint ${id} updated.`);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update complaint.');
    }
  };

  const addNote = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const note = String(new FormData(form).get('note') || '').trim();
    if (!note) return;
    try {
      const updated = await api.updateComplaint(id, { note });
      setComplaints(complaints.map((complaint) => complaint.id === id ? updated : complaint));
      // The SyntheticEvent's currentTarget is nulled out once the handler yields past this await,
      // so the form element must be captured beforehand rather than read off `event` again.
      form.reset();
      notify(`Note added to ${id}.`);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to add note.');
    }
  };

  return (
    <>
      <PageHeader title="Staff dashboard" description="Review assigned repairs, add notes, and complete work orders." />
      <StatsGrid
        stats={[
          { label: 'Assigned complaints', value: assigned.length, icon: ClipboardCheck },
          { label: 'Pending work', value: complaints.filter((complaint) => complaint.status === 'Assigned').length, icon: Clock3, tone: 'pending' },
          { label: 'In-progress work', value: complaints.filter((complaint) => complaint.status === 'In Progress').length, icon: Activity, tone: 'active' },
          { label: 'Completed work', value: complaints.filter((complaint) => complaint.status === 'Resolved' || complaint.status === 'Closed').length, icon: CheckCircle2, tone: 'resolved' }
        ]}
      />
      <Panel title="Assigned complaint list">
        <div className="work-list">
          {assigned.map((complaint) => (
            <form className="work-card" key={complaint.id} onSubmit={(event) => addNote(event, complaint.id)}>
              <div>
                <Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link>
                <p>
                  {complaint.building}, Room {complaint.room} • {complaint.category}
                </p>
                <p className="muted">
                  Submitted by {complaint.student}
                  {complaint.studentPhone ? ` • ${complaint.studentPhone}` : ''}
                </p>
                <Badge label={complaint.priority} type="priority" /> <Badge label={complaint.status} />
              </div>
              <div className="quick-actions">
                <button type="button" disabled={complaint.status !== 'Assigned'} onClick={() => updateStatus(complaint.id, 'In Progress')}>Start</button>
                <button type="button" disabled={complaint.status !== 'In Progress'} onClick={() => updateStatus(complaint.id, 'Resolved')}>Resolve</button>
              </div>
              <textarea name="note" aria-label={`Repair notes for ${complaint.id}`} placeholder="Add repair notes..." rows={2} />
              <button className="button button-secondary" type="submit">Add note</button>
            </form>
          ))}
        </div>
      </Panel>
      <Panel title="Pending complaints (unassigned)">
        {pendingQueue.length === 0 ? (
          <p className="muted">No unassigned complaints are waiting right now.</p>
        ) : (
          <div className="work-list">
            {pendingQueue.map((complaint) => (
              <div className="work-card" key={complaint.id}>
                <div>
                  <Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link>
                  <p>
                    {complaint.building}, Room {complaint.room} • {complaint.category}
                  </p>
                  <p className="muted">
                    Submitted by {complaint.student}
                    {complaint.studentPhone ? ` • ${complaint.studentPhone}` : ''}
                  </p>
                  <Badge label={complaint.priority} type="priority" /> <Badge label={complaint.status} />
                </div>
                <p className="muted">Waiting for an administrator to assign this to a staff member.</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}


export function AdminDashboardPage() {
  const { complaints } = useFixTrack();
  const [userCount, setUserCount] = useState(0);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const byCategory = aggregate(complaints, 'category');
  const byStatus = aggregate(complaints, 'status');
  const byBuilding = aggregate(complaints, 'building');
  const staffWorkload = [
    ...staffUsers.map((staff) => ({
      name: staff.name,
      count: complaints.filter((complaint) => complaint.staffUserId === staff.id).length
    })),
    { name: 'Unassigned', count: complaints.filter((complaint) => !complaint.staffUserId).length }
  ];

  useEffect(() => {
    void api.getUsers()
      .then((items) => {
        setUserCount(items.length);
        setStaffUsers(items.filter((user) => user.role === 'Maintenance Staff'));
      })
      .catch(() => {
        setUserCount(0);
        setStaffUsers([]);
      });
  }, []);

  return (
    <AdminOnlyGate title="Admin dashboard" description="Only administrators can monitor hostel-wide maintenance, assignments, and users.">
      <PageHeader title="Admin dashboard" description="Monitor hostel-wide maintenance, assignments, activity, and emergency work." />
      <StatsGrid
        stats={[
          { label: 'Total users', value: userCount, icon: Users },
          { label: 'Total complaints', value: complaints.length, icon: FileText },
          { label: 'Pending complaints', value: complaints.filter((complaint) => complaint.status === 'Pending').length, icon: Clock3, tone: 'pending' },
          { label: 'Emergency complaints', value: complaints.filter((complaint) => complaint.priority === 'Emergency').length, icon: AlertTriangle, tone: 'danger' },
          { label: 'Resolved complaints', value: complaints.filter((complaint) => complaint.status === 'Resolved').length, icon: CheckCircle2, tone: 'resolved' }
        ]}
      />
      <div className="content-grid">
        <ChartPanel title="Complaint categories" data={byCategory} type="bar" />
        <ChartPanel title="Complaint statuses" data={byStatus} type="pie" />
      </div>
      <div className="content-grid three">
        <Panel title="Recent activity">{complaints.slice(0, 4).map((complaint) => <ActivityItem key={complaint.id} complaint={complaint} />)}</Panel>
        <Panel title="Staff workload overview">{staffWorkload.map((staff) => <Workload key={staff.name} name={staff.name} count={staff.count} />)}</Panel>
        <Panel title="Building-wise summary">{byBuilding.map((building) => <Workload key={building.name} name={building.name} count={building.value} />)}</Panel>
      </div>
    </AdminOnlyGate>
  );
}


export function AdminComplaintsPage() {
  const { complaints, setComplaints, notify } = useFixTrack();
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const displayedComplaints = complaints.filter((complaint) =>
    `${complaint.id} ${complaint.title} ${complaint.building} ${complaint.student}`.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    void api.getUsers()
      .then((items) => setStaffUsers(items.filter((user) => user.role === 'Maintenance Staff' && user.status === 'Active')))
      .catch((caught) => notify(caught instanceof Error ? caught.message : 'Unable to load staff.'));
  }, [notify]);

  const update = async (
    id: string,
    input: { priority?: ComplaintPriority; status?: ComplaintStatus; staffUserId?: string }
  ) => {
    try {
      const updated = await api.updateComplaint(id, input);
      setComplaints(complaints.map((complaint) => complaint.id === id ? updated : complaint));
      notify('Complaint updated.');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update complaint.');
    }
  };

  return (
    <AdminOnlyGate title="Complaint management" description="Only administrators can assign staff, change priority, and update complaint history.">
      <PageHeader title="Complaint management" description="Assign staff, change priority or status, and view complaint history." />
      <Panel>
        <div className="table-tools">
          <div className="topbar-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all complaints..." />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Student</th><th>Building</th><th>Priority</th><th>Status</th><th>Assign staff</th><th>History</th></tr>
            </thead>
            <tbody>
              {displayedComplaints.map((complaint) => (
                <tr key={complaint.id}>
                  <td>{complaint.id}</td>
                  <td>
                    <Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link>
                    <span>{complaint.category}</span>
                  </td>
                  <td><Link href={`/admin/users/${complaint.studentUserId}`}>{complaint.student}</Link></td>
                  <td>{complaint.building}</td>
                  <td>
                    <select value={complaint.priority} onChange={(event) => update(complaint.id, { priority: event.target.value as ComplaintPriority })}>
                      {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={complaint.status} onChange={(event) => update(complaint.id, { status: event.target.value as ComplaintStatus })}>
                      {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={complaint.staffUserId || ''} onChange={(event) => update(complaint.id, { staffUserId: event.target.value })}>
                      <option value="" disabled>Unassigned</option>
                      {staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                    </select>
                  </td>
                  <td>{complaint.updates.join(' -> ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AdminOnlyGate>
  );
}


export function UserManagementPage() {
  const { complaints, notify } = useFixTrack();
  const [query, setQuery] = useState('');
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const filtered = managedUsers.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    void api.getUsers()
      .then(setManagedUsers)
      .catch((caught) => notify(caught instanceof Error ? caught.message : 'Unable to load users.'));
  }, [notify]);

  const updateManagedUser = async (id: string, input: { role?: User['role']; status?: User['status'] }) => {
    try {
      const updated = await api.updateUser(id, input);
      setManagedUsers((items) => items.map((item) => item.id === id ? updated : item));
      notify('User updated successfully.');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update user.');
    }
  };

  const createPrivilegedUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await api.createPrivilegedUser({
        name: String(data.get('name') || ''),
        email: String(data.get('email') || ''),
        password: String(data.get('password') || ''),
        phone: String(data.get('phone') || ''),
        role: String(data.get('role')) as 'Maintenance Staff' | 'Administrator',
        building: String(data.get('building') || ''),
        room: String(data.get('room') || '')
      });
      setManagedUsers((items) => [...items, created]);
      // Captured above: `event.currentTarget` is nulled out by the time this await resolves.
      form.reset();
      notify('Privileged user created successfully.');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to create user.');
    }
  };

  return (
    <AdminOnlyGate title="User management" description="Only administrators can manage users, account status, and roles.">
      <PageHeader title="User management" description="Manage students, maintenance staff, administrators, account status, and roles." />
      <Panel title="Create staff or administrator">
        <form className="form two-col" onSubmit={createPrivilegedUser}>
          <Input label="Name" name="name" required />
          <Input label="Email" name="email" type="email" required />
          <Input label="Password" name="password" type="password" minLength={8} maxLength={20} required />
          <Input label="Phone" name="phone" required />
          <Select label="Role" name="role" options={['Maintenance Staff', 'Administrator']} />
          <Select label="Building" name="building" options={[...buildings]} />
          <Input label="Room" name="room" required />
          <button className="button button-primary span-2" type="submit">Create account</button>
        </form>
      </Panel>
      <Panel>
        <div className="table-tools">
          <div className="topbar-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." />
          </div>
        </div>
        <div className="user-grid">
          {filtered.map((user) => (
            <article className="user-card" key={user.id}>
              <span className="avatar large">{initials(user.name)}</span>
              <h3><Link href={`/admin/users/${user.id}`}>{user.name}</Link></h3>
              <p>{user.email}</p>
              <Badge label={user.role} />
              <div className="user-controls">
                <select value={user.role} aria-label={`Change role for ${user.name}`} onChange={(event) => updateManagedUser(user.id, { role: event.target.value as User['role'] })}>
                  <option>Student</option>
                  <option>Maintenance Staff</option>
                  <option>Administrator</option>
                </select>
                <button onClick={() => updateManagedUser(user.id, { status: user.status === 'Active' ? 'Inactive' : 'Active' })}>{user.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
              </div>
              <small>{complaints.filter((complaint) => complaint.studentUserId === user.id || complaint.staffUserId === user.id).length} related complaints</small>
            </article>
          ))}
        </div>
      </Panel>
    </AdminOnlyGate>
  );
}

export function UserDetailPage({ id }: { id: string }) {
  const { complaints, currentUser, notify } = useFixTrack();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getUserById(id)
      .then((fetched) => {
        if (active) setUser(fetched);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load this user.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const updateUser = async (input: { role?: User['role']; status?: User['status'] }) => {
    if (!user) return;
    try {
      const updated = await api.updateUser(user.id, input);
      setUser(updated);
      notify('User updated successfully.');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to update user.');
    }
  };

  return (
    <AdminOnlyGate title="User profile" description="Only administrators can view full user profiles.">
      {loading ? (
        <EmptyState title="Loading..." text="Fetching user details." compact />
      ) : !user ? (
        <EmptyState title="User not found" text={error || 'This user does not exist.'} />
      ) : (
        <>
          <PageHeader title={user.name} description={`${user.role} • ${user.email}`} action={<Link className="button button-secondary" href="/admin/users">Back to users</Link>} />
          <div className="content-grid">
            <Panel title="Profile">
              <div className="profile-card">
                <span className="avatar profile">{initials(user.name)}</span>
                <h2>{user.name}</h2>
                <p>{user.role} • {user.building}, Room {user.room || '-'}</p>
                {user.studentId && <p className="muted">Student ID: {user.studentId}</p>}
              </div>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Phone:</strong> {user.phone}</p>
              <p><strong>Status:</strong> <Badge label={user.status} /></p>
              <p><strong>Two-factor authentication:</strong> {user.totpEnabled ? 'Enabled' : 'Disabled'}</p>
            </Panel>
            <Panel title="Manage account">
              {currentUser.id === user.id ? (
                <p className="muted">You cannot change your own role or account status.</p>
              ) : (
                <div className="user-controls">
                  <select value={user.role} aria-label={`Change role for ${user.name}`} onChange={(event) => updateUser({ role: event.target.value as User['role'] })}>
                    <option>Student</option>
                    <option>Maintenance Staff</option>
                    <option>Administrator</option>
                  </select>
                  <button onClick={() => updateUser({ status: user.status === 'Active' ? 'Inactive' : 'Active' })}>
                    {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </Panel>
          </div>
          <Panel title={user.role === 'Maintenance Staff' ? 'Assigned complaints' : 'Submitted complaints'}>
            {(() => {
              const related = complaints.filter((complaint) =>
                user.role === 'Maintenance Staff' ? complaint.staffUserId === user.id : complaint.studentUserId === user.id
              );
              return related.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>ID</th><th>Title</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {related.map((complaint) => (
                        <tr key={complaint.id}>
                          <td>{complaint.id}</td>
                          <td><Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link></td>
                          <td>{complaint.category}</td>
                          <td><Badge label={complaint.priority} type="priority" /></td>
                          <td><Badge label={complaint.status} /></td>
                          <td>{complaint.submitted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No complaints yet" text="Nothing to show here yet." compact />
              );
            })()}
          </Panel>
        </>
      )}
    </AdminOnlyGate>
  );
}

const activityFilters = ['All', 'Logins', 'Registrations', 'Complaints', 'Account changes'] as const;
type ActivityFilter = (typeof activityFilters)[number];

const activityFilterTypes: Record<Exclude<ActivityFilter, 'All'>, AuditEventType[]> = {
  Logins: ['user.login_success', 'user.login_failed', 'user.account_locked'],
  Registrations: ['user.registered', 'user.privileged_created'],
  Complaints: ['complaint.created', 'complaint.status_changed', 'complaint.assigned', 'complaint.note_added'],
  'Account changes': ['user.role_changed', 'user.status_changed']
};

const activityIcons: Record<AuditEventType, LucideIcon> = {
  'user.registered': Users,
  'user.privileged_created': UserCog,
  'user.login_success': LogIn,
  'user.login_failed': AlertTriangle,
  'user.account_locked': AlertTriangle,
  'user.role_changed': UserCog,
  'user.status_changed': UserCog,
  'complaint.created': ClipboardCheck,
  'complaint.status_changed': Activity,
  'complaint.assigned': BriefcaseBusiness,
  'complaint.note_added': FileText
};

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ActivityLogPage() {
  const { notify } = useFixTrack();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityFilter>('All');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await api.getAuditLog(200);
      setEvents(items);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to load the activity log.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = events.filter((event) => {
    const matchesFilter = filter === 'All' || activityFilterTypes[filter].includes(event.type);
    const matchesQuery = `${event.message} ${event.actorName}`.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <AdminOnlyGate title="Activity log" description="Only administrators can review platform-wide activity.">
      <PageHeader
        title="Activity log"
        description="A live trail of logins, registrations, complaint actions, and account changes across FixTrack."
        action={
          <button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />
      <Panel>
        <div className="table-tools">
          <div className="topbar-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity..." />
          </div>
          <div className="filter-pills">
            {activityFilters.map((option) => (
              <button
                key={option}
                type="button"
                className={`filter-pill ${filter === option ? 'active' : ''}`}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <ul className="activity-log">
            {filtered.map((event) => {
              const Icon = activityIcons[event.type] || Activity;
              return (
                <li key={event.id} className="activity-log-row">
                  <span className="activity-log-icon">
                    <Icon />
                  </span>
                  <div className="activity-log-body">
                    <p>{event.message}</p>
                    <small>{formatEventTime(event.createdAt)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={loading ? 'Loading activity...' : 'No activity found'} text="Try a different search or filter." />
        )}
      </Panel>
    </AdminOnlyGate>
  );
}

export function ProfilePage() {
  const { notify, currentUser, setCurrentUser } = useFixTrack();
  const [totpSetup, setTotpSetup] = useState<{ qrCodeDataUrl: string; otpauthUrl: string } | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [totpError, setTotpError] = useState('');

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const updated = await api.updateProfile({
        name: String(data.get('name') || currentUser.name),
        phone: String(data.get('phone') || currentUser.phone),
        building: String(data.get('building') || currentUser.building),
        room: String(data.get('room') || currentUser.room)
      });
      setCurrentUser(updated);
      notify('Profile saved successfully.');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to save profile.');
    }
  };

  const beginTotpSetup = async () => {
    setTotpError('');
    try {
      const setup = await api.setupTotp(currentUser.id);
      setTotpSetup(setup);
      notify('Scan the QR code with your authenticator app.');
    } catch (caught) {
      setTotpError(caught instanceof Error ? caught.message : 'Unable to start two-factor setup.');
    }
  };

  const verifyTotpSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTotpError('');

    try {
      const user = await api.verifyTotpSetup(currentUser.id, totpToken);
      setCurrentUser({ ...currentUser, ...user, photo: currentUser.photo });
      setTotpSetup(null);
      setTotpToken('');
      notify('Two-factor authentication enabled.');
    } catch (caught) {
      setTotpError(caught instanceof Error ? caught.message : 'Invalid authenticator code.');
    }
  };

  const disableTotp = async () => {
    setTotpError('');

    if (totpToken.length !== 6) {
      setTotpError('Enter your current 6-digit authenticator code to disable two-factor authentication.');
      return;
    }

    try {
      const user = await api.disableTotp(currentUser.id, totpToken);
      setCurrentUser({ ...currentUser, ...user, photo: currentUser.photo });
      setTotpSetup(null);
      setTotpToken('');
      notify('Two-factor authentication disabled.');
    } catch (caught) {
      setTotpError(caught instanceof Error ? caught.message : 'Unable to disable two-factor authentication.');
    }
  };

  return (
    <>
      <PageHeader title="Profile" description="Update personal details and account preferences." />
      <section className="profile-layout">
        <Panel>
          <div className="profile-card">
            <span className="avatar profile">{initials(currentUser.name)}</span>
            <h2>{currentUser.name}</h2>
            <p>
              {currentUser.role} • {currentUser.building}, Room {currentUser.room || '-'}
            </p>
            {currentUser.studentId && <p className="muted">Student ID: {currentUser.studentId}</p>}
          </div>
        </Panel>
        <Panel title="Edit profile">
          <form className="form two-col" onSubmit={saveProfile}>
            <Input label="Name" name="name" defaultValue={currentUser.name} />
            <Input label="Email" type="email" value={currentUser.email} disabled />
            <Input label="Phone number" name="phone" defaultValue={currentUser.phone} />
            <Select label="Hostel building" name="building" options={buildings.slice(0, 4)} defaultValue={currentUser.building} />
            <Input label="Room number" name="room" defaultValue={currentUser.room} />
            <button className="button button-primary span-2">Save profile</button>
          </form>
        </Panel>
        <Panel title="Security">
          <div className="security-block">
            <div>
              <strong>Two-factor authentication</strong>
              <p className="muted">
                {currentUser.totpEnabled ? 'Enabled for this account.' : 'Add a 6-digit authenticator code after password login.'}
              </p>
            </div>
            {currentUser.totpEnabled ? (
              <span className="muted">Current authenticator code required to disable</span>
            ) : (
              <button className="button button-secondary" type="button" onClick={beginTotpSetup}>
                Enable 2FA
              </button>
            )}
          </div>
          {totpError && <p className="validation">{totpError}</p>}
          {currentUser.totpEnabled && (
            <div className="form">
              <Input label="Current authenticator code" inputMode="numeric" maxLength={6} value={totpToken} onChange={(event) => setTotpToken(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required />
              <button className="button button-danger" type="button" onClick={disableTotp}>Disable 2FA</button>
            </div>
          )}
          {totpSetup && (
            <form className="form" onSubmit={verifyTotpSetup}>
              <img className="totp-qr" src={totpSetup.qrCodeDataUrl} alt="Authenticator setup QR code" />
              <Input label="Authenticator code" inputMode="numeric" maxLength={6} value={totpToken} onChange={(event) => setTotpToken(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required />
              <button className="button button-primary" type="submit">
                Verify and enable
              </button>
            </form>
          )}
        </Panel>
      </section>
    </>
  );
}

function PageHeader({ title, description, action }: PageHeaderProps) {
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

function Panel({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <section className="panel">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

function Input({ label, name, compact, ...props }: InputProps) {
  return (
    <label className={`field ${compact ? 'compact-field' : ''}`}>
      {label}
      <input name={name || label.toLowerCase().replaceAll(' ', '-')} {...props} />
    </label>
  );
}

function Select({ label, name, options, compact, ...props }: SelectProps) {
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

function StatsGrid({ stats }: { stats: StatItem[] }) {
  return (
    <section className="stats-grid">
      {stats.map((item) => (
        <StatCard key={item.label} {...item} />
      ))}
    </section>
  );
}

function StatCard({ label, value, icon: Icon, tone }: StatItem) {
  return (
    <article className={`stat-card ${tone || ''}`}>
      <Icon />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function PrioritySelector() {
  return (
    <fieldset className="priority-selector span-2">
      <legend>Priority</legend>
      {priorities.map((priority) => (
        <label key={priority}>
          <input type="radio" name="priority" value={priority} defaultChecked={priority === 'Medium'} /> <span>{priority}</span>
        </label>
      ))}
    </fieldset>
  );
}

function FilterBar({
  query,
  setQuery,
  status,
  setStatus,
  category,
  setCategory
}: {
  query: string;
  setQuery: (value: string) => void;
  status: ComplaintStatus | 'All';
  setStatus: (value: ComplaintStatus | 'All') => void;
  category: ComplaintCategoryName | 'All';
  setCategory: (value: ComplaintCategoryName | 'All') => void;
}) {
  return (
    <section className="filter-bar">
      <div className="topbar-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search complaints..." />
      </div>
      <label>
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value as ComplaintStatus | 'All')}>
          {['All', ...statuses].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value as ComplaintCategoryName | 'All')}>
          {['All', ...categories.map((item) => item.name)].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
    </section>
  );
}

function ComplaintList({ complaints }: { complaints: Complaint[] }) {
  if (!complaints.length) return <EmptyState title="No complaints yet" text="Your submitted reports will appear here." compact />;

  return (
    <div className="complaint-list">
      {complaints.map((complaint) => (
        <Link href={`/complaints/${complaint.id}`} key={complaint.id}>
          <span>{complaint.title}</span>
          <Badge label={complaint.status} />
          <ChevronRight />
        </Link>
      ))}
    </div>
  );
}

function ComplaintTable({ complaints }: { complaints: Complaint[] }) {
  return (
    <Panel>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Title</th><th>Category</th><th>Priority</th><th>Status</th><th>Date</th><th>Assigned staff</th></tr>
          </thead>
          <tbody>
            {complaints.map((complaint) => (
              <tr key={complaint.id}>
                <td>{complaint.id}</td>
                <td><Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link></td>
                <td>{complaint.category}</td>
                <td><Badge label={complaint.priority} type="priority" /></td>
                <td><Badge label={complaint.status} /></td>
                <td>{complaint.submitted}</td>
                <td>{complaint.staff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Badge({ label, type }: { label: string; type?: 'priority' }) {
  const cls = `badge ${type === 'priority' ? `priority-${label.toLowerCase()}` : `status-${label.toLowerCase().replaceAll(' ', '-')}`}`;
  return <span className={cls}>{label}</span>;
}

function Timeline({ status }: { status: ComplaintStatus }) {
  const current = statuses.indexOf(status);
  return (
    <div className="timeline">
      {statuses.map((item, index) => (
        <div className={`timeline-step ${index <= current ? 'done' : ''}`} key={item}>
          <span>{index + 1}</span>
          <strong>{item}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, text, compact }: { title: string; text: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${compact ? 'compact-empty' : ''}`}>
      <Archive />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ChartPanel({ title, data, type }: { title: string; data: ChartDatum[]; type: 'bar' | 'pie' }) {
  const colors = ['#0f766e', '#2563eb', '#f59e0b', '#22c55e', '#ef4444', '#64748b'];
  return (
    <Panel title={title}>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={280}>
          {type === 'bar' ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#0f766e" />
            </BarChart>
          ) : (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={95} label>
                {data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function ActivityItem({ complaint }: { complaint: Complaint }) {
  return (
    <div className="activity-item">
      <Activity />
      <div>
        <strong>
          {complaint.status}: {complaint.title}
        </strong>
        <span>
          {complaint.id} • {complaint.staff}
        </span>
      </div>
    </div>
  );
}

function Workload({ name, count }: { name: string; count: number }) {
  return (
    <div className="workload">
      <span>{name}</span>
      <strong>{count}</strong>
      <div>
        <span style={{ width: `${Math.min(100, count * 28)}%` }} />
      </div>
    </div>
  );
}
