/**
 * Landing Page Component
 * Public homepage showing FixTrack features and login/register options
 */

'use client';

import Link from 'next/link';
import { FileText, Activity, Camera, Users, Wrench, LogIn, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function FeatureCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="feature-card">
      <Icon />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
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
            <FileText />
            <div>
              <strong>Emergency lock issue</strong>
              <span>Cedar Block, Room 120</span>
            </div>
          </div>
          <div className="repair-card">
            <Activity />
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
