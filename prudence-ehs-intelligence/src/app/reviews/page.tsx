'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

type Status = 'Completed' | 'Processing' | 'Pending' | 'Error';

interface Review {
  id: string;
  document: string;
  docType: string;
  track: string;
  status: Status;
  findings: number | null;
  score: number | null;
  expertFlag: boolean;
  date: string;
}

const allReviews: Review[] = [
  {
    id: 'rev-001',
    document: 'HazCom Program - Facility A.pdf',
    docType: 'OSHA Program Review',
    track: 'Hazard Communication',
    status: 'Completed',
    findings: 14,
    score: 72,
    expertFlag: true,
    date: '2026-04-05',
  },
  {
    id: 'rev-002',
    document: 'IAQ Assessment - Building 7.docx',
    docType: 'IAQ / Ventilation Review',
    track: 'ASHRAE 62.1 Nonresidential',
    status: 'Completed',
    findings: 9,
    score: 85,
    expertFlag: false,
    date: '2026-04-04',
  },
  {
    id: 'rev-003',
    document: 'LOTO Procedures - Plant B.pdf',
    docType: 'OSHA Program Review',
    track: 'Lockout/Tagout',
    status: 'Processing',
    findings: null,
    score: null,
    expertFlag: false,
    date: '2026-04-04',
  },
  {
    id: 'rev-004',
    document: 'Emergency Action Plan - Campus.pdf',
    docType: 'OSHA Program Review',
    track: 'Emergency Action Plan',
    status: 'Completed',
    findings: 21,
    score: 64,
    expertFlag: true,
    date: '2026-04-03',
  },
  {
    id: 'rev-005',
    document: 'Thermal Comfort Eval - Suite 400.docx',
    docType: 'IAQ / Ventilation Review',
    track: 'ASHRAE 55 Thermal Comfort',
    status: 'Pending',
    findings: null,
    score: null,
    expertFlag: false,
    date: '2026-04-03',
  },
  {
    id: 'rev-006',
    document: 'Respiratory Protection Manual.pdf',
    docType: 'OSHA Program Review',
    track: 'Respiratory Protection',
    status: 'Completed',
    findings: 17,
    score: 68,
    expertFlag: true,
    date: '2026-04-02',
  },
  {
    id: 'rev-007',
    document: 'Ventilation Design Report - Bldg 3.pdf',
    docType: 'IAQ / Ventilation Review',
    track: 'ASHRAE 62.1 Nonresidential',
    status: 'Error',
    findings: null,
    score: null,
    expertFlag: false,
    date: '2026-04-01',
  },
  {
    id: 'rev-008',
    document: 'HazCom SDS Inventory - Warehouse.docx',
    docType: 'OSHA Program Review',
    track: 'Hazard Communication',
    status: 'Completed',
    findings: 6,
    score: 91,
    expertFlag: false,
    date: '2026-03-31',
  },
];

const statuses: (Status | 'All')[] = [
  'All',
  'Pending',
  'Processing',
  'Completed',
  'Error',
];

const types = ['All', 'OSHA Program Review', 'IAQ / Ventilation Review'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusBadge(status: Status) {
  const styles: Record<Status, string> = {
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    Processing: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    Pending: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    Error: 'bg-red-50 text-red-700 ring-red-600/20',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = allReviews.filter((r) => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (typeFilter !== 'All' && r.docType !== typeFilter) return false;
    if (
      search &&
      !r.document.toLowerCase().includes(search.toLowerCase()) &&
      !r.track.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Reviews</h1>
          <p className="page-description">
            All document reviews and their analysis results
          </p>
        </div>
        <Link
          href="/reviews/new"
          className="inline-flex items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Review
        </Link>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents or tracks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as Status | 'All')
            }
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All Statuses' : s}
              </option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'All' ? 'All Types' : t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="px-6 py-3">Document Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Track</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Findings</th>
                <th className="px-6 py-3 text-right">Score</th>
                <th className="px-6 py-3 text-center">Expert</th>
                <th className="px-6 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-gray-400"
                  >
                    No reviews match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="group transition-colors hover:bg-gray-50/60"
                >
                  <td className="whitespace-nowrap px-6 py-3.5">
                    <Link
                      href={`/reviews/${r.id}`}
                      className="font-medium text-gray-900 group-hover:text-brand-600"
                    >
                      {r.document}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-gray-500">
                    {r.docType}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-gray-500">
                    {r.track}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5">
                    {statusBadge(r.status)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3.5 text-right text-gray-600">
                    {r.findings ?? (
                      <span className="text-gray-300">&mdash;</span>
                    )}
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
                  <td className="whitespace-nowrap px-6 py-3.5 text-center">
                    {r.expertFlag ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20">
                        <AlertTriangle className="h-3 w-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">&mdash;</span>
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

        {/* Pagination hint */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
          <p className="text-xs text-gray-400">
            Showing {filtered.length} of {allReviews.length} reviews
          </p>
          <div className="flex items-center gap-1">
            <button className="rounded p-1 text-gray-300" disabled>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
              1
            </span>
            <button className="rounded p-1 text-gray-300" disabled>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
