import Link from 'next/link';

type Props = {
  current: {
    q?: string;
    status?: string;
    priority?: string;
  };
};

export function IssueFilters({ current }: Props) {
  const statuses = ['', 'Open', 'In Progress', 'Waiting for CS', 'Waiting for Customer', 'Escalated to Development', 'Resolved', 'Closed'];
  const priorities = ['', 'Low', 'Medium', 'High', 'Critical'];

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <form action="/issues" className="grid gap-4 md:grid-cols-4">
        <input
          type="text"
          name="q"
          defaultValue={current.q || ''}
          placeholder="Search company, issue, module..."
          className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
        />

        <select
          name="status"
          defaultValue={current.status || ''}
          className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
        >
          {statuses.map((status) => (
            <option key={status || 'all'} value={status}>
              {status || 'All statuses'}
            </option>
          ))}
        </select>

        <select
          name="priority"
          defaultValue={current.priority || ''}
          className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
        >
          {priorities.map((priority) => (
            <option key={priority || 'all'} value={priority}>
              {priority || 'All priorities'}
            </option>
          ))}
        </select>

        <div className="flex gap-3">
          <button type="submit" className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
            Apply filters
          </button>
          <Link href="/issues" className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-white">
            Reset
          </Link>
        </div>
      </form>
    </div>
  );
}
