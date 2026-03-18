import { getIssues } from '@/lib/api';
import { IssueFilters } from '@/components/issues/IssueFilters';
import { IssuesTable } from '@/components/issues/IssuesTable';
import { IssueDrawer } from '@/components/issues/IssueDrawer';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IssuesPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const status = typeof params.status === 'string' ? params.status : '';
  const priority = typeof params.priority === 'string' ? params.priority : '';
  const selectedId = typeof params.id === 'string' ? Number(params.id) : null;

  const response = await getIssues({
    q,
    status,
    priority,
    page: 1,
    pageSize: 50
  });

  const selectedIssue = selectedId
    ? response.items.find((issue) => issue.id === selectedId) || null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Issue explorer</h2>
        <p className="mt-2 text-sm text-slate-400">
          Search and filter support issues, then open an issue to inspect the full operational context.
        </p>
      </div>

      <IssueFilters current={{ q, status, priority }} />
      <IssuesTable issues={response.items} />

      {selectedIssue ? (
        <section className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold">Selected issue</h3>
            <p className="text-sm text-slate-400">Full issue details and internal notes.</p>
          </div>
          <IssueDrawer issue={selectedIssue} />
        </section>
      ) : null}
    </div>
  );
}
