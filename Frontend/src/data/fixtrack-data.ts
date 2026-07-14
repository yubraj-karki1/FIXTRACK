import type { ComplaintCategory, ComplaintPriority, ComplaintStatus } from '@/types';

// Public, non-sensitive UI configuration. User and complaint records are loaded from protected APIs.
export const categories: ComplaintCategory[] = [
  { name: 'Water', color: '#0ea5e9' },
  { name: 'Electricity', color: '#f59e0b' },
  { name: 'Wi-Fi', color: '#2563eb' },
  { name: 'Bathroom', color: '#14b8a6' },
  { name: 'Door/Lock', color: '#64748b' },
  { name: 'Furniture', color: '#8b5cf6' },
  { name: 'Cleaning', color: '#22c55e' },
  { name: 'Other', color: '#475569' }
];

export const statuses: ComplaintStatus[] = ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
export const priorities: ComplaintPriority[] = ['Low', 'Medium', 'High', 'Emergency'];
export const buildings = ['Maple Hall', 'Cedar Block', 'North Wing', 'South Wing', 'Admin Office'] as const;
