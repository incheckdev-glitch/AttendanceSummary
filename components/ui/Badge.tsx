import { titleCase } from '@/lib/format';

type Props = {
  value: string;
};

function getTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (['critical', 'high'].includes(normalized)) return 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30';
  if (['resolved', 'closed'].includes(normalized)) return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30';
  if (['in progress', 'waiting for customer', 'waiting for cs'].includes(normalized)) return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30';
  if (['escalated to development', 'yes'].includes(normalized)) return 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30';
  return 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30';
}

export function Badge({ value }: Props) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getTone(value || 'blank')}`}>
      {titleCase(value || 'Blank')}
    </span>
  );
}
