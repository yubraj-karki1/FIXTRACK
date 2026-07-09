import type { ChartDatum, Complaint } from '@/types';

export function makeStatusStats(items: Complaint[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, complaint) => {
    acc[complaint.status] = (acc[complaint.status] || 0) + 1;
    return acc;
  }, {});
}

export function aggregate<T extends object>(items: T[], key: keyof T): ChartDatum[] {
  return Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      const value = String(item[key]);
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
