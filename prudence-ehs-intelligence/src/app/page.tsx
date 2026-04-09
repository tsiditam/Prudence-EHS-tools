import Link from 'next/link';
import {
  FileSearch,
  AlertTriangle,
  ShieldAlert,
  BookOpen,
  ArrowUpRight,
  Clock,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const stats = [
  {
    label: 'Total Reviews',
    value: 142,
    icon: FileSearch,
    accent: 'border-brand-600',
    iconColor: 'text-brand-600 bg-brand-50',
    delta: '+12 this month',
  },
  {
    label: 'Active Findings',
    value: 387,
    icon: AlertTriangle,
    accent: 'border-orange-500',
    iconColor: 'text-orange-600 bg-orange-50',
    delta: '23 critical',
  },
  {
    label: 'Expert Escalations',
    value: 18,
    icon: ShieldAlert,
    accent: 'border-purple-500',
    iconColor: 'text-purple-600 bg-purple-50',
    delta: '6 pending review',
  },
  {
    label: 'Citation Coverage',
    value: '94.2%',
    icon: BookOpen,
    accent: 'border-emerald-500',
    iconColor: 'text-emerald-600 bg-emerald-50',
    delta: 'Up from 91.8%',
  },
];

const severityData = [
  { label: 'Critical', count: 23, color: 'bg-red-600', pct: 6 },
  { label: 'High', count: 64, color: 'bg-orange-500', pct: 17 },
  { label: 'Moderate', count: 128, color: 'bg-amber-500', pct: 33 },
  { label: 'Low', count: 134, color: 'bg-blue-500', pct: 35 },
  { label: 'Informational', count: 38, color: 'bg-gray-400', pct: 10 },
];

const classificationData = [
  { label: 'Regulatory Deficiency', count: 87, color: 'bg-red-600', pct: 22 },
  { label: 'Technical Benchmark Gap', count: 104, color: 'bg-amber-500', pct: 27 },
  { label: 'Best Practice Improvement', count: 121, color: 'bg-blue-500', pct: 31 },
  { label: 'Unable to Determine', count: 32, color: 'bg-gray-400', pct: 8 },
  { label: 'Expert Review Required', count: 43, color: 'bg-purple-500', pct: 11 },
];

const recentReviews = [
  {
    id: 'rev-001',
    document: 'HazCom Program - Facility A.pdf',
    type: 'OSHA Program Review',
    track: 'Hazard Communication',
    status: 'Completed',
    findings: 14,
    score: 72,
    date: '2026-04-05',
  },
  {
    id: 'rev-002',
    document: 'IAQ Assessment - Building 7.docx',
    type: 'IAQ / Ventilation Review',
    track: 'ASHRAE 62.1 Nonresidential',
    status: 'Completed',
    findings: 9,
    score: 85,
    date: '2026-04-04',
  },
  {
    id: 'rev-003',
    document: 'LOTO Procedures - Plant B.pdf',
    type: 'OSHA Program Review',
    track: 'Lockout/Tagout',
    status: 'Processing',
    findings: null,
    score: null,
    date: '2026-04-04',
  },
  {
    id: 'rev-004',
    document: 'Emergency Action Plan - Campus.pdf',
    type: 'OSHA Program Review',
    track: 'Emergency Action Plan',
    status: 'Completed',
    findings: 21,
    score: 64,
    date: '2026-04-03',
  },
  {
    id: 'rev-005',
    document: 'Thermal Comfort Eval - Suite 400.docx',
    type: 'IAQ / Ventilation Review',
    track: 'ASHRAE 55 Thermal Comfort',
    status: 'Pending',
    findings: null,
    score: null,
    date: '2026-04-03',
  },
];

const recurringIssues = [
  { code: 'HAZCOM-SDS-001', label: 'Missing or outdated SDS for on-site chemicals', count: 34 },
  { code: 'IAQ-VENT-003', label: 'Outdoor air rate below ASHRAE 62.1 minimum', count: 28 },
  { code: 'LOTO-PROC-002', label: 'Incomplete energy source isolation procedure', count: 22 },
  { code: 'EAP-EVAC-001', label: 'Evacuation route signage deficiency', count: 19 },
  { code: 'RESP-FIT-004', label: 'Annual fit test documentation gap', count: 16 },
];

const rulePacksTriggered = [
  { name: 'OSHA 1910.1200 — HazCom', triggerCount: 87, rulesActive: 24 },
  { name: 'ASHRAE 62.1-2022 — Ventilation', triggerCount: 64, rulesActive: 18 },
  { name: 'OSHA 1910.147 — LOTO', triggerCount: 52, rulesActive: 16 },
  { name: 'OSHA 1910.38 — EAP', triggerCount: 41, rulesActive: 12 },
  { name: 'ASHRAE 55-2023 — Thermal Comfort', triggerCount: 29, rulesActive: 10 },
  { name: 'OSHA 1910.134 — Respiratory Protection', triggerCount: 23, rulesActive: 14 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    Processing: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    Pending: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    Error: 'bg-red-50 text-red-700 ring-red-600/20',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${map[status] ?? map.Pending}`}
    >
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">
          Intelligence overview across all reviews
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`relative overflow-hidden rounded-xl border-l-4 ${s.accent} bg-white p-5 shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{s.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                  {s.value}
                </p>
                <p className="mt-1 text-xs text-gray-400">{s.delta}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${s.iconColor}`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Findings by Severity */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Findings by Severity
          </h2>
          <p className="mb-5 mt-1 text-xs text-gray-400">
            Distribution of {severityData.reduce((a, d) => a + d.count, 0)} total findings
          </p>
          <div className="space-y-4">
            {severityData.map((d) => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 text-xs font-medium text-gray-600">
                  {d.label}
                </span>
                <div className="flex-1">
                  <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${d.color}`}
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-xs font-semibold text-gray-700">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Findings by Classification */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Findings by Classification
          </h2>
          <p className="mb-5 mt-1 text-xs text-gray-400">
            Distribution of {classificationData.reduce((a, d) => a + d.count, 0)} total findings
          </p>
          <div className="space-y-4">
            {classificationData.map((d) => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="w-44 flex-shrink-0 text-xs font-medium text-gray-600">
                  {d.label}
                </span>
                <div className="flex-1">
                  <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${d.color}`}
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-xs font-semibold text-gray-700">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Reviews */}
      <div className="rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recent Reviews</h2>
            <p className="mt-0.5 text-xs text-gray-400">Latest document reviews</p>
          </div>
          <Link
            href="/reviews"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="px-6 py-3">Document</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Track</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Findings</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentReviews.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-gray-50/60"
                >
                  <td className="whitespace-nowrap px-6 py-3.5 font-medium text-gray-900">
                    <Link
                      href={`/reviews/${r.id}`}
                      className="hover:text-brand-600"
                    >
                      {r.document}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-gray-500">
                    {r.type}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-gray-500">
                    {r.track}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5">
                    {statusBadge(r.status)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-right text-gray-600">
                    {r.findings ?? <span className="text-gray-300">&mdash;</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-right">
                    {r.score != null ? (
                      <span
                        className={`font-semibold ${
                          r.score >= 80
                            ? 'text-emerald-600'
                            : r.score >= 60
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {r.score}
                      </span>
                    ) : (
                      <span className="text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-right text-gray-400">
                    {r.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Recurring Issues */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Top Recurring Issues
          </h2>
          <p className="mb-4 mt-1 text-xs text-gray-400">
            Most frequently identified finding codes
          </p>
          <ul className="divide-y divide-gray-50">
            {recurringIssues.map((issue, i) => (
              <li key={issue.code} className="flex items-start gap-3 py-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900">
                    {issue.code}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {issue.label}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                  {issue.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Rule Packs Triggered */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Rule Packs Triggered
          </h2>
          <p className="mb-4 mt-1 text-xs text-gray-400">
            Active rule packs and their trigger frequency
          </p>
          <ul className="divide-y divide-gray-50">
            {rulePacksTriggered.map((pack) => (
              <li
                key={pack.name}
                className="flex items-center justify-between py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-900">
                    {pack.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {pack.rulesActive} rules active
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: `${Math.round(
                          (pack.triggerCount / rulePacksTriggered[0].triggerCount) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-gray-600">
                    {pack.triggerCount}
                  </span>
                  <Clock className="h-3 w-3 text-gray-300" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
