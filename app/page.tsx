import { getAnalytics, getIssues, getSummary } from '@/lib/api';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { StatusChart } from '@/components/dashboard/StatusChart';
import { BarBreakdownChart } from '@/components/dashboard/BarBreakdownChart';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { IssuesTable } from '@/components/issues/IssuesTable';
import { Card } from '@/components/ui/Card';
import { toDisplayNumber } from '@/lib/format';

function toChartData(record: Record<string, number>) {
  return Object.entries(record).map(([name, value]) => ({ name, value }));
}

export default async function DashboardPage() {
  const [summary, analytics, recentIssues] = await Promise.all([
    getSummary(),
    getAnalytics(),
    getIssues({ page: 1, pageSize: 8 })
  ]);

  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Resolution performance" className="xl:col-span-1">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <p className="text-sm text-slate-400">Average resolution (days)</p>
              <p className="mt-2 text-3xl font-semibold">{toDisplayNumber(analytics.averageResolutionDays)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Median resolution (days)</p>
              <p className="mt-2 text-3xl font-semibold">{toDisplayNumber(analytics.medianResolutionDays)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Open issues</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.openIssues}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Resolved issues</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.resolvedIssues}</p>
            </div>
          </div>
        </Card>
        <div className="xl:col-span-2">
          <TrendChart data={analytics.trend} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <StatusChart title="Issues by status" data={toChartData(summary.byStatus)} />
        <BarBreakdownChart title="Issues by priority" data={toChartData(summary.byPriority)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BarBreakdownChart title="Issues by category" data={toChartData(summary.byCategory)} />
        <BarBreakdownChart title="Aging buckets" data={analytics.aging.map((item) => ({ name: item.label, value: item.count }))} />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Recent issues</h2>
          <p className="text-sm text-slate-400">Newest submitted issues from your support tracker.</p>
        </div>
        <IssuesTable issues={recentIssues.items} />
      </section>
    </div>
  );
}
