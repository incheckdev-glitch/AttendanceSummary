import { Issue } from '@/lib/types';

function normalize(value: string) {
  return String(value || '').trim().toLowerCase();
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolutionDays(issue: Issue): number | null {
  const openedAt = parseDate(issue.requestDate || issue.timestamp);
  const closedAt = parseDate(issue.resolutionClosureDate);
  if (!openedAt || !closedAt) return null;
  return (closedAt.getTime() - openedAt.getTime()) / (1000 * 60 * 60 * 24);
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getAgingBucket(issue: Issue, now = new Date()) {
  const status = normalize(issue.finalStatus);
  if (['resolved', 'closed'].includes(status)) return null;

  const openedAt = parseDate(issue.requestDate || issue.timestamp);
  if (!openedAt) return null;

  const ageInDays = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (ageInDays <= 2) return '0-2 days';
  if (ageInDays <= 7) return '3-7 days';
  if (ageInDays <= 14) return '8-14 days';
  return '15+ days';
}
