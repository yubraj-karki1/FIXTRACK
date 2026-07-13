//Dashboard Layout Wrapper
//Main dashboard layout providing navigation, top bar, and logout confirmation
//Shown to all authenticated users with role-based menu visibility


'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Bell, LogOut, LayoutDashboard, ClipboardCheck, BriefcaseBusiness, Plus, UserCog, Archive, Users, Settings, Search, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFixTrack } from '@/context/FixTrackContext';
import { initials } from '@/data/helpers';
import { defaultCurrentUser } from '@/data/fixtrack-data';
import { isAdminUser } from '../utils/helpers';
import type { PropsWithChildren } from 'react';

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
