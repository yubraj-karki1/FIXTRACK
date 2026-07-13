'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bath,
  Bell,
  Bolt,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  Droplets,
  FileText,
  Filter,
  ImagePlus,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Sofa,
  Sparkles,
  UserCog,
  Users,
  Wrench,
  X,
  Wifi
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormEvent, InputHTMLAttributes, PropsWithChildren, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
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
import { buildings, categories, defaultCurrentUser, priorities, statuses, users } from '@/data/fixtrack-data';
import { api } from '@/lib/api';
import type {
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

function getDashboardPath(userOrEmail: User | string): string {
  const role = typeof userOrEmail === 'string' ? '' : userOrEmail.role;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email).toLowerCase();

  if (isAdminUser(userOrEmail)) return '/admin';
  if (role === 'Maintenance Staff' || email.includes('staff') || email.includes('maintenance') 
    || email.includes('ramesh') || email.includes('mina')) return '/staff';
  return '/student';
}

function isAdminUser(userOrEmail?: User | string): boolean {
  if (!userOrEmail) return false;

  const role = typeof userOrEmail === 'string' ? '' : userOrEmail.role;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email).toLowerCase();
  return role === 'Administrator' || email.includes('admin');
}

function isAdminOnlyPath(path?: string | null): boolean {
  return !!path && (path === '/complaints/new' || path === '/admin' || path.startsWith('/admin/'));
}

function getLoginTarget(requestedNext: string | null, userOrEmail: User | string): string {
  if (requestedNext && (!isAdminOnlyPath(requestedNext) || isAdminUser(userOrEmail))) {
    return requestedNext;
  }

  return getDashboardPath(userOrEmail);
}

interface PasswordRule {
  label: string;
  met: boolean;
}

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

function getPasswordStrengthLabel(score: number): string {
  if (score <= 2) return 'Weak';
  if (score <= 4) return 'Medium';
  if (score === 5) return 'Strong';
  return 'Very strong';
}

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

const totpUsersStorageKey = 'fixtrack:totp-users';

function getStoredTotpUsers(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem(totpUsersStorageKey) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberTotpUser(user: User): void {
  if (typeof window === 'undefined') return;

  const stored = getStoredTotpUsers();
  stored[user.email.toLowerCase()] = user.id;
  window.localStorage.setItem(totpUsersStorageKey, JSON.stringify(stored));
}

function forgetTotpUser(user: User): void {
  if (typeof window === 'undefined') return;

  const stored = getStoredTotpUsers();
  delete stored[user.email.toLowerCase()];
  window.localStorage.setItem(totpUsersStorageKey, JSON.stringify(stored));
}

function getRememberedTotpUserId(email: string, matchedUser?: User): string | undefined {
  const stored = getStoredTotpUsers();
  return stored[email.toLowerCase()] || (matchedUser?.totpEnabled ? matchedUser.id : undefined);
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
        <FeatureCard icon={Camera} title="Image evidence" text="Photo upload previews help staff inspect the problem before visiting the room." />
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

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, setCurrentUser } = useFixTrack();
  const [error, setError] = useState('');
  const googleLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === 'true';

  useEffect(() => {
    const googleError = searchParams.get('googleError');
    if (googleError) {
      if (googleError.includes('Google login')) {
        router.replace('/login');
        return;
      }

      setError(googleError);
      return;
    }

    const googleUser = searchParams.get('googleUser');
    if (!googleUser) return;

    try {
      const normalized = googleUser.replace(/-/g, '+').replace(/_/g, '/');
      const user = JSON.parse(window.atob(normalized)) as User;
      setCurrentUser({ ...user, photo: '' });
      notify('Logged in with Google.');
      router.replace(getLoginTarget(searchParams.get('next'), user));
    } catch {
      setError('Unable to finish Google login.');
    }
  }, [notify, router, searchParams, setCurrentUser]);

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
        if (matchedUser) rememberTotpUser({ ...matchedUser, id: login.userId, totpEnabled: true });
        notify('Enter your authenticator code to finish login.');
        router.push(`/totp?userId=${login.userId}&next=${encodeURIComponent(target)}`);
        return;
      }

      if (login.user) {
        setCurrentUser({ ...login.user, photo: matchedUser?.photo || '' });
      }

      notify('Logged in successfully.');
      router.push(target);
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
          <Link href="/login">Forgot password?</Link>
        </div>
        <button className="button button-primary full" type="submit">
          Login
        </button>
        {googleLoginEnabled && (
          <a className="button button-secondary full" href="/api/auth/google">
            Continue with Google
          </a>
        )}
        <p className="form-help">
          No account yet? <Link href="/register">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}

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
  const { currentUser, setCurrentUser, notify } = useFixTrack();
  const isAdmin = isAdminUser(currentUser);
  const nav: Array<[string, string, LucideIcon, boolean?]> = [
    ['Student', '/student', LayoutDashboard],
    ['My Complaints', '/complaints', ClipboardCheck],
    ['Staff', '/staff', BriefcaseBusiness],
    ['Add Panel', '/complaints/new', Plus, true],
    ['Admin', '/admin', UserCog, true],
    ['Manage Reports', '/admin/complaints', Archive, true],
    ['Users', '/admin/users', Users, true],
    ['Profile', '/profile', Settings]
  ];
  const visibleNav = nav.filter(([, , , adminOnly]) => !adminOnly || isAdmin);

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    setCurrentUser(defaultCurrentUser);
    notify('Logged out successfully.');
    router.push('/login');
  };
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
          <div className="topbar-search">
            <Search />
            <input aria-label="Global search" placeholder="Search complaints, rooms, staff..." />
          </div>
          <div className="topbar-actions">
            <Bell />
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
  const mine = complaints.filter((complaint) => complaint.student === currentUser.name);
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
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    if (!data.get('title') || !data.get('description') || !data.get('room')) {
      setError('Please complete the title, description, and room number.');
      return;
    }

    const next: Complaint = {
      id: `FX-${2400 + complaints.length + 1}`,
      title: String(data.get('title')),
      category: data.get('category') as ComplaintCategoryName,
      priority: data.get('priority') as ComplaintPriority,
      status: 'Pending',
      building: String(data.get('building')),
      room: String(data.get('room')),
      student: currentUser.name,
      staff: 'Unassigned',
      submitted: '2026-07-07',
      description: String(data.get('description')),
      image: preview || 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?auto=format&fit=crop&w=900&q=80',
      notes: [],
      updates: ['Pending']
    };

    setComplaints([next, ...complaints]);
    notify('Complaint submitted successfully.');
    router.push('/complaints');
  };
  return (
    <AdminOnlyGate title="Add panel" description="Create maintenance complaints from the administrator workspace.">
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
          <label className="upload-area span-2">
            <ImagePlus />
            <strong>Upload evidence image</strong>
            <span>PNG or JPG preview appears here</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
          {preview && <img className="image-preview span-2" src={preview} alt="Selected complaint evidence preview" />}
          <button className="button button-primary span-2" type="submit">
            Submit complaint
          </button>
        </form>
      </Panel>
    </AdminOnlyGate>
  );
}

export function MyComplaintsPage() {
  const { complaints, currentUser } = useFixTrack();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ComplaintStatus | 'All'>('All');
  const [category, setCategory] = useState<ComplaintCategoryName | 'All'>('All');
  const myComplaints = complaints.filter((complaint) => complaint.student === currentUser.name);
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
  const { complaints, setComplaints, notify } = useFixTrack();
  const complaint = complaints.find((item) => item.id === id) || complaints[0];
  const canEdit = complaint.status === 'Pending';

  const cancel = () => {
    setComplaints(
      complaints.map((item) =>
        item.id === complaint.id
          ? {
              ...item,
              status: 'Closed',
              notes: [...item.notes, 'Cancelled by student before assignment.'],
              updates: [...new Set([...item.updates, 'Closed' as ComplaintStatus])]
            }
          : item
      )
    );
    notify('Complaint cancelled.');
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
  const assigned = complaints.filter((complaint) => complaint.staff === 'Ramesh Karki' || complaint.status !== 'Closed');

  const updateStatus = (id: string, status: ComplaintStatus) => {
    setComplaints(
      complaints.map((complaint) =>
        complaint.id === id
          ? {
              ...complaint,
              status,
              updates: [...new Set([...complaint.updates, status])],
              notes: [...complaint.notes, `Status updated to ${status} by staff.`]
            }
          : complaint
      )
    );
    notify(`Complaint ${id} updated.`);
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
        <div className="filter-row">
          <Select label="Building" options={['All', ...buildings.slice(0, 4)]} compact />
          <Select label="Category" options={['All', ...categories.map((category) => category.name)]} compact />
          <Select label="Priority" options={['All', ...priorities]} compact />
          <Select label="Status" options={['All', ...statuses]} compact />
        </div>
        <div className="work-list">
          {assigned.map((complaint) => (
            <article className="work-card" key={complaint.id}>
              <div>
                <Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link>
                <p>
                  {complaint.building}, Room {complaint.room} • {complaint.category}
                </p>
                <Badge label={complaint.priority} type="priority" /> <Badge label={complaint.status} />
              </div>
              <div className="quick-actions">
                <button onClick={() => updateStatus(complaint.id, 'In Progress')}>Start</button>
                <button onClick={() => updateStatus(complaint.id, 'Resolved')}>Resolve</button>
                <label className="small-upload">
                  <Camera /> Completion image
                  <input type="file" />
                </label>
              </div>
              <textarea aria-label={`Repair notes for ${complaint.id}`} placeholder="Add repair notes..." rows={2} />
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function AdminDashboardPage() {
  const { complaints } = useFixTrack();
  const byCategory = aggregate(complaints, 'category');
  const byStatus = aggregate(complaints, 'status');
  const byBuilding = aggregate(complaints, 'building');

  return (
    <AdminOnlyGate title="Admin dashboard" description="Only administrators can monitor hostel-wide maintenance, assignments, and users.">
      <PageHeader title="Admin dashboard" description="Monitor hostel-wide maintenance, assignments, activity, and emergency work." />
      <StatsGrid
        stats={[
          { label: 'Total users', value: users.length, icon: Users },
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
        <Panel title="Staff workload overview">{['Ramesh Karki', 'Mina Gurung', 'Unassigned'].map((staff) => <Workload key={staff} name={staff} count={complaints.filter((complaint) => complaint.staff === staff).length} />)}</Panel>
        <Panel title="Building-wise summary">{byBuilding.map((building) => <Workload key={building.name} name={building.name} count={building.value} />)}</Panel>
      </div>
    </AdminOnlyGate>
  );
}

export function AdminComplaintsPage() {
  const { complaints, setComplaints, notify } = useFixTrack();

  const update = (id: string, key: keyof Pick<Complaint, 'priority' | 'status' | 'staff'>, value: string) => {
    setComplaints(
      complaints.map((complaint) =>
        complaint.id === id
          ? {
              ...complaint,
              [key]: value,
              updates: key === 'status' ? [...new Set([...complaint.updates, value as ComplaintStatus])] : complaint.updates
            }
          : complaint
      )
    );
    notify('Complaint updated.');
  };

  return (
    <AdminOnlyGate title="Complaint management" description="Only administrators can assign staff, change priority, and update complaint history.">
      <PageHeader title="Complaint management" description="Assign staff, change priority or status, and view complaint history." />
      <Panel>
        <div className="table-tools">
          <div className="topbar-search">
            <Search />
            <input placeholder="Search all complaints..." />
          </div>
          <button className="button button-secondary">
            <Filter /> Filters
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th><th>Building</th><th>Priority</th><th>Status</th><th>Assign staff</th><th>History</th></tr>
            </thead>
            <tbody>
              {complaints.map((complaint) => (
                <tr key={complaint.id}>
                  <td>{complaint.id}</td>
                  <td>
                    <Link href={`/complaints/${complaint.id}`}>{complaint.title}</Link>
                    <span>{complaint.category}</span>
                  </td>
                  <td>{complaint.building}</td>
                  <td>
                    <select value={complaint.priority} onChange={(event) => update(complaint.id, 'priority', event.target.value)}>
                      {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={complaint.status} onChange={(event) => update(complaint.id, 'status', event.target.value)}>
                      {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={complaint.staff} onChange={(event) => update(complaint.id, 'staff', event.target.value)}>
                      {['Unassigned', 'Ramesh Karki', 'Mina Gurung'].map((staff) => <option key={staff}>{staff}</option>)}
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
  const filtered = users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <AdminOnlyGate title="User management" description="Only administrators can manage users, account status, and roles.">
      <PageHeader title="User management" description="Manage students, maintenance staff, administrators, account status, and roles." />
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
              <h3>{user.name}</h3>
              <p>{user.email}</p>
              <Badge label={user.role} />
              <div className="user-controls">
                <select defaultValue={user.role} aria-label={`Change role for ${user.name}`} onChange={() => notify('Role updated in demo state.')}>
                  <option>Student</option>
                  <option>Maintenance Staff</option>
                  <option>Administrator</option>
                </select>
                <button onClick={() => notify('User activation status changed.')}>{user.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
              </div>
              <small>{complaints.filter((complaint) => complaint.student === user.name || complaint.staff === user.name).length} related complaints</small>
            </article>
          ))}
        </div>
      </Panel>
    </AdminOnlyGate>
  );
}

export function ProfilePage() {
  const { notify, currentUser, setCurrentUser } = useFixTrack();
  const [photoPreview, setPhotoPreview] = useState(currentUser.photo || '');
  const [totpSetup, setTotpSetup] = useState<{ qrCodeDataUrl: string; otpauthUrl: string } | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [totpError, setTotpError] = useState('');

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setCurrentUser({
      ...currentUser,
      name: String(data.get('name') || currentUser.name),
      email: String(data.get('email') || currentUser.email),
      phone: String(data.get('phone-number') || currentUser.phone),
      building: String(data.get('hostel-building') || currentUser.building),
      room: String(data.get('room-number') || currentUser.room),
      photo: photoPreview
    });
    notify('Profile saved successfully.');
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
      rememberTotpUser({ ...currentUser, ...user, totpEnabled: true });
      setTotpSetup(null);
      setTotpToken('');
      notify('Two-factor authentication enabled.');
    } catch (caught) {
      setTotpError(caught instanceof Error ? caught.message : 'Invalid authenticator code.');
    }
  };

  const disableTotp = async () => {
    setTotpError('');

    try {
      const user = await api.disableTotp(currentUser.id);
      setCurrentUser({ ...currentUser, ...user, photo: currentUser.photo });
      forgetTotpUser(currentUser);
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
            {photoPreview ? <img className="profile-photo" src={photoPreview} alt={`${currentUser.name} profile`} /> : <span className="avatar profile">{initials(currentUser.name)}</span>}
            <h2>{currentUser.name}</h2>
            <p>
              {currentUser.role} • {currentUser.building}, Room {currentUser.room || '-'}
            </p>
            {currentUser.studentId && <p className="muted">Student ID: {currentUser.studentId}</p>}
          </div>
        </Panel>
        <Panel title="Edit profile">
          <form className="form two-col" onSubmit={saveProfile}>
            <Input label="Name" defaultValue={currentUser.name} />
            <Input label="Email" type="email" defaultValue={currentUser.email} />
            <Input label="Phone number" defaultValue={currentUser.phone} />
            <Select label="Hostel building" options={buildings.slice(0, 4)} defaultValue={currentUser.building} />
            <Input label="Room number" defaultValue={currentUser.room} />
            <label className="field">
              Profile photo
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setPhotoPreview(URL.createObjectURL(file));
                }}
              />
            </label>
            <button className="button button-primary span-2">Save profile</button>
          </form>
        </Panel>
        <Panel title="Account settings">
          <div className="settings-list">
            <span>Email notifications</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="settings-list">
            <span>SMS emergency alerts</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="settings-list">
            <span>Maintenance update digest</span>
            <input type="checkbox" />
          </div>
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
              <button className="button button-danger" type="button" onClick={disableTotp}>
                Disable 2FA
              </button>
            ) : (
              <button className="button button-secondary" type="button" onClick={beginTotpSetup}>
                Enable 2FA
              </button>
            )}
          </div>
          {totpError && <p className="validation">{totpError}</p>}
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
