import { AlertOctagon, FolderKanban, ShieldAlert, CheckCircle2, Siren } from 'lucide-react';
import { SummaryResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';

const items = [
  { key: 'total', label: 'Total Issues', icon: FolderKanban },
  { key: 'open', label: 'Open Issues', icon: AlertOctagon },
  { key: 'resolvedClosed', label: 'Resolved / Closed', icon: CheckCircle2 },
  { key: 'escalated', label: 'Escalated', icon: ShieldAlert },
  { key: 'highCritical', label: 'High / Critical', icon: Siren }
] as const;

type Props = {
  summary: SummaryResponse;
};

export function SummaryCards({ summary }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.key}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{summary[item.key]}</p>
              </div>
              <div className="rounded-2xl bg-slate-800 p-3 text-slate-200">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
