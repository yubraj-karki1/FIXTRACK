//Dashboard Layout Wrapper
//Main dashboard layout providing navigation, top bar, and logout confirmation
//Shown to all authenticated users with role-based menu visibility
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, LayoutDashboard, ClipboardCheck, BriefcaseBusiness, Plus, UserCog, Archive, Users, Settings, Wrench, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFixTrack } from '@/context/FixTrackContext';
import { initials } from '@/data/helpers';
import { isAdminUser } from '../utils/helpers';
import type { PropsWithChildren } from 'react';

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
    ['Profile', '/profile', Settings]
  ];

  const visibleNav = nav.filter(([label, , , adminOnly]) =>
    (!adminOnly || isAdmin) &&
    (label !== 'Staff' || currentUser.role === 'Maintenance Staff' || isAdmin) &&
    (label !== 'New Complaint' || currentUser.role !== 'Maintenance Staff')
  );

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authStatus, pathname, router]);

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      // Logout must call the API because HttpOnly cookies are inaccessible to browser JavaScript.
      await logout();
      notify('Logged out successfully.');
      router.replace('/login');
      router.refresh();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Unable to log out.');
    }
  };

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
