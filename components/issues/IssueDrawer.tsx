import { Issue } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { toDisplayDate } from '@/lib/format';

type Props = {
  issue: Issue;
};

const fields: Array<[label: string, valueKey: keyof Issue]> = [
  ['Submitted by', 'submittedBy'],
  ['Company', 'companyName'],
  ['Category', 'issueCategory'],
  ['Priority', 'priorityLevel'],
  ['Impact type', 'impactType'],
  ['Module', 'productModuleAffected'],
  ['Reported channel', 'reportedChannel'],
  ['Source', 'sourceOfIssue'],
  ['Pattern', 'issuePattern'],
  ['Environment', 'environment'],
  ['Browser / Device / OS', 'browserDeviceOs'],
  ['Development ticket', 'developmentTicket'],
  ['CS informed', 'wasCsInformed']
];

export function IssueDrawer({ issue }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Issue #{issue.id}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{issue.issueTitle || 'Untitled issue'}</h2>
            <p className="mt-2 text-sm text-slate-400">Opened {toDisplayDate(issue.requestDate || issue.timestamp)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value={issue.priorityLevel} />
            <Badge value={issue.finalStatus} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Issue metadata">
          <dl className="grid gap-3">
            {fields.map(([label, key]) => (
              <div key={label} className="grid grid-cols-2 gap-3 border-b border-slate-800 pb-3 last:border-b-0 last:pb-0">
                <dt className="text-sm text-slate-400">{label}</dt>
                <dd className="text-sm text-white">{String(issue[key] || '—')}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Operational notes">
          <div className="space-y-4 text-sm text-slate-200">
            <section>
              <h3 className="mb-1 font-semibold text-white">Detailed description</h3>
              <p className="text-slate-300">{issue.detailedDescription || '—'}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-white">Initial assessment</h3>
              <p className="text-slate-300">{issue.initialAssessment || '—'}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-white">Root cause type</h3>
              <p className="text-slate-300">{issue.rootCauseType || '—'}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-white">Internal notes</h3>
              <p className="text-slate-300">{issue.internalNotes || '—'}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-white">Workaround</h3>
              <p className="text-slate-300">{issue.workaroundDetails || issue.workaroundAvailable || '—'}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-white">Error message</h3>
              <p className="text-slate-300">{issue.errorMessage || '—'}</p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
