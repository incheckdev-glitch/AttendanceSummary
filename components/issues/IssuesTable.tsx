import Link from 'next/link';
import { Issue } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { toDisplayDate } from '@/lib/format';

type Props = {
  issues: Issue[];
};

export function IssuesTable({ issues }: Props) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-950/60 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Request Date</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Module</th>
              <th className="px-4 py-3 font-medium">Escalated</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {issues.map((issue) => (
              <tr key={issue.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3">{toDisplayDate(issue.requestDate || issue.timestamp)}</td>
                <td className="px-4 py-3">{issue.companyName || '—'}</td>
                <td className="px-4 py-3">{issue.issueTitle || '—'}</td>
                <td className="px-4 py-3">{issue.issueCategory || '—'}</td>
                <td className="px-4 py-3"><Badge value={issue.priorityLevel} /></td>
                <td className="px-4 py-3">{issue.productModuleAffected || '—'}</td>
                <td className="px-4 py-3"><Badge value={issue.escalationRequired || 'No'} /></td>
                <td className="px-4 py-3"><Badge value={issue.finalStatus || 'Open'} /></td>
                <td className="px-4 py-3">
                  <Link href={`/issues?id=${issue.id}`} className="font-medium text-sky-300 hover:text-sky-200">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!issues.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  No issues matched your current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
