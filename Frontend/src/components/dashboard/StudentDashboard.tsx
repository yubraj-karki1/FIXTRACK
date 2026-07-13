/**
 * Student Dashboard Page
 * Shows welcome message, complaint statistics, and recent complaints
 * Displays category shortcuts for quick navigation
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { FileText, Clock3, Activity, CheckCircle2, ClipboardCheck, Droplets, Bolt, Wifi, Bath, DoorOpen, Sofa, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useFixTrack } from '@/context/FixTrackContext';
import { makeStatusStats } from '@/data/helpers';
import { categories } from '@/data/fixtrack-data';
import { PageHeader, Panel } from '../shared/UIComponents';
import { ComplaintList, StatsGrid, Timeline } from './ComplaintComponents';

const categoryIcons: Record<string, LucideIcon> = {
  Water: Droplets,
  Electricity: Bolt,
  'Wi-Fi': Wifi,
  Bathroom: Bath,
  'Door/Lock': DoorOpen,
  Furniture: Sofa,
  Cleaning: Sparkles,
  Other: Wrench
};

export function StudentDashboardPage() {
  const { complaints, currentUser } = useFixTrack();
  const mine = complaints.filter((complaint) => complaint.student === currentUser.name);
  const stats = makeStatusStats(mine);

  return (
    <>
      <PageHeader
        title={`Welcome, ${currentUser.name.split(' ')[0] || 'Student'}`}
        description="Track your hostel repairs and follow maintenance updates in a few clicks."
        action={
          <Link className="button button-primary" href="/complaints">
            <ClipboardCheck /> My Complaints
          </Link>
        }
      />
      <StatsGrid
        stats={[
          { label: 'Total complaints', value: mine.length, icon: FileText },
          { label: 'Pending complaints', value: stats.Pending || 0, icon: Clock3, tone: 'pending' },
          { label: 'In-progress complaints', value: stats['In Progress'] || 0, icon: Activity, tone: 'active' },
          {
            label: 'Resolved complaints',
            value: (stats.Resolved || 0) + (stats.Closed || 0),
            icon: CheckCircle2,
            tone: 'resolved'
          }
        ]}
      />
      <section className="category-strip">
        {categories.map(({ name }) => (
          <Link href="/complaints" key={name}>
            {React.createElement(categoryIcons[name] || Wrench)}
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
