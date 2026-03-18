import { getAnalytics } from '@/lib/api';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { BarBreakdownChart } from '@/components/dashboard/BarBreakdownChart';
import { Card } from '@/components/ui/Card';
import { toDisplayNumber } from '@/lib/format';

export default async function AnalyticsPage() {
  const analytics = await getAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Analytics</h2>
        <p className="mt-2 text-sm text-slate-400">
          Track trend volume, issue aging, and the biggest impact areas across customers and modules.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card title="Open issues"><p className="text-3xl font-semibold">{analytics.openIssues}</p></Card>
        <Card title="Resolved issues"><p className="text-3xl font-semibold">{analytics.resolvedIssues}</p></Card>
        <Card title="Avg resolution"><p className="text-3xl font-semibold">{toDisplayNumber(analytics.averageResolutionDays)}</p></Card>
        <Card title="Median resolution"><p className="text-3xl font-semibold">{toDisplayNumber(analytics.medianResolutionDays)}</p></Card>
      </div>

      <TrendChart data={analytics.trend} />

      <div className="grid gap-6 lg:grid-cols-2">
        <BarBreakdownChart title="Aging buckets" data={analytics.aging.map((item) => ({ name: item.label, value: item.count }))} />
        <BarBreakdownChart title="Top affected companies" data={analytics.topCompanies.map((item) => ({ name: item.label, value: item.count }))} />
      </div>

      <BarBreakdownChart title="Top affected modules" data={analytics.topModules.map((item) => ({ name: item.label, value: item.count }))} />
    </div>
  );
}
