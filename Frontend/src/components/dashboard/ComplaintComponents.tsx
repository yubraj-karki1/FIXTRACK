import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { statuses } from '@/data/fixtrack-data';
import type { Complaint, ComplaintStatus } from '@/types';
import { Badge, EmptyState } from '../shared/UIComponents';

interface StatItem {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: string;
}

export function StatsGrid({ stats }: { stats: StatItem[] }) {
  return (
    <section className="stats-grid">
      {stats.map(({ label, value, icon: Icon, tone }) => (
        <article className={`stat-card ${tone || ''}`} key={label}>
          <Icon />
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}

export function ComplaintList({ complaints }: { complaints: Complaint[] }) {
  if (!complaints.length) {
    return <EmptyState title="No complaints yet" text="Your submitted reports will appear here." compact />;
  }

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

export function Timeline({ status }: { status: ComplaintStatus }) {
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
