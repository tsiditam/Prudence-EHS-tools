'use client';

import { useState } from 'react';
import { AlertTriangle, User, Clock, CheckCircle2, XCircle } from 'lucide-react';

type EscalationStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

interface Escalation {
  id: string;
  documentName: string;
  findingCode: string;
  findingTitle: string;
  reason: string;
  confidence: number;
  contradictions: string[];
  status: EscalationStatus;
  assignedTo: string;
  reviewerNotes: string;
  createdAt: string;
}

const escalations: Escalation[] = [
  {
    id: '1',
    documentName: 'HazCom Program - Facility B.pdf',
    findingCode: 'HAZCOM-004',
    findingTitle: 'Employee training program not documented',
    reason: 'Contradictory facts: Document references "annual training" in Section 3 but states "no formal training program" in Section 7.',
    confidence: 0.45,
    contradictions: [
      'Section 3 mentions "annual training schedule for all employees"',
      'Section 7 states "no formal training program has been established"',
    ],
    status: 'open',
    assignedTo: '',
    reviewerNotes: '',
    createdAt: '2026-04-08',
  },
  {
    id: '2',
    documentName: 'IAQ Assessment - Building 12.docx',
    findingCode: 'VENT-62.1-003',
    findingTitle: 'Outdoor air method or basis not defined',
    reason: 'Engineering adequacy assessment needed: Ventilation system design references a non-standard approach that requires CIH review.',
    confidence: 0.55,
    contradictions: [],
    status: 'open',
    assignedTo: '',
    reviewerNotes: '',
    createdAt: '2026-04-07',
  },
  {
    id: '3',
    documentName: 'Resp Pro Program - Clinic A.pdf',
    findingCode: 'RESPPRO-001',
    findingTitle: 'Respiratory hazard basis not established',
    reason: 'Healthcare-adjacent facility: Infectious aerosol controls require CIH review for adequacy of respiratory protection program in clinical setting.',
    confidence: 0.50,
    contradictions: [],
    status: 'in_progress',
    assignedTo: 'Dr. Martinez, CIH',
    reviewerNotes: 'Reviewing exposure assessment methodology for clinical aerosol-generating procedures.',
    createdAt: '2026-04-05',
  },
  {
    id: '4',
    documentName: 'IAQ Assessment - Building 5.docx',
    findingCode: 'VENT-62.1-009',
    findingTitle: 'Moisture or contaminant source considerations not addressed',
    reason: 'Mold remediation program gaps identified: Site-specific assessment required by qualified professional.',
    confidence: 0.40,
    contradictions: [],
    status: 'resolved',
    assignedTo: 'J. Thompson, CSP',
    reviewerNotes: 'Confirmed mold assessment completed 2026-03-15. Remediation plan in place. Finding downgraded to informational.',
    createdAt: '2026-04-01',
  },
];

const statusConfig: Record<EscalationStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'text-amber-700', bg: 'bg-amber-50' },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-50' },
  resolved: { label: 'Resolved', color: 'text-green-700', bg: 'bg-green-50' },
  dismissed: { label: 'Dismissed', color: 'text-gray-700', bg: 'bg-gray-50' },
};

export default function EscalationsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = escalations.filter(
    (e) => statusFilter === 'all' || e.status === statusFilter
  );

  const counts = {
    open: escalations.filter((e) => e.status === 'open').length,
    in_progress: escalations.filter((e) => e.status === 'in_progress').length,
    resolved: escalations.filter((e) => e.status === 'resolved').length,
    dismissed: escalations.filter((e) => e.status === 'dismissed').length,
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Expert Review Queue</h1>
        <p className="page-description">Items flagged for professional review</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Open', count: counts.open, color: 'border-amber-500' },
          { label: 'In Progress', count: counts.in_progress, color: 'border-blue-500' },
          { label: 'Resolved', count: counts.resolved, color: 'border-green-500' },
          { label: 'Dismissed', count: counts.dismissed, color: 'border-gray-400' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border-l-4 ${s.color} bg-white p-4 shadow-sm`}>
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {/* Escalation Cards */}
      <div className="space-y-4">
        {filtered.map((esc) => {
          const sc = statusConfig[esc.status];
          return (
            <div
              key={esc.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold text-gray-900">{esc.findingTitle}</h3>
                    <span className="font-mono text-xs text-gray-400">{esc.findingCode}</span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.bg} ${sc.color}`}>
                      {sc.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">From: {esc.documentName}</p>
                </div>
                <span className="text-xs text-gray-400">{esc.createdAt}</span>
              </div>

              {/* Reason */}
              <div className="mt-4 rounded-lg bg-purple-50 p-3">
                <p className="text-sm font-medium text-purple-900">Escalation Reason</p>
                <p className="mt-1 text-sm text-purple-800">{esc.reason}</p>
              </div>

              {/* Confidence */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Confidence Level</span>
                  <span className={`font-medium ${esc.confidence >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                    {Math.round(esc.confidence * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${esc.confidence >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${esc.confidence * 100}%` }}
                  />
                </div>
              </div>

              {/* Contradictions */}
              {esc.contradictions.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700">Unresolved Contradictions</p>
                  <ul className="mt-1 space-y-1">
                    {esc.contradictions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Assigned To & Notes */}
              {esc.assignedTo && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4 text-gray-400" />
                  Assigned to: <span className="font-medium">{esc.assignedTo}</span>
                </div>
              )}
              {esc.reviewerNotes && (
                <div className="mt-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Reviewer Notes</p>
                  <p className="mt-1 text-sm text-gray-700">{esc.reviewerNotes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-2 border-t border-gray-100 pt-4">
                <button className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  Assign
                </button>
                <button className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100">
                  Resolve
                </button>
                <button className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
