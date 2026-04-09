'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, FileText, Braces, Table2,
  ChevronDown, ChevronRight, X, ExternalLink,
  AlertTriangle, CheckCircle2, Shield, BookOpen,
  Info,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Mock Data                                                           */
/* ------------------------------------------------------------------ */

const REVIEW = {
  id: 'rev-001',
  fileName: 'HazCom Program - Facility A.pdf',
  documentType: 'OSHA Program Review',
  standardTrack: 'Hazard Communication',
  status: 'completed',
  overallScore: 35,
  reviewDate: '2026-04-09',
  rulePacks: ['OSHA Hazard Communication'],
};

interface Finding {
  code: string;
  title: string;
  classification: string;
  severity: string;
  confidence: number;
  escalation: boolean;
  evidence: string;
  why: string;
  action: string;
  citations: { short: string; title: string; authority: string; summary: string; url: string }[];
}

const FINDINGS: Finding[] = [
  {
    code: 'HAZCOM-001', title: 'Written HazCom program not identified',
    classification: 'regulatory_deficiency', severity: 'critical', confidence: 0.95, escalation: false,
    evidence: 'No written hazard communication program was identified in the submitted materials. The document does not contain language establishing a formal, written program as required.',
    why: '29 CFR 1910.1200(e)(1) requires employers to develop, implement, and maintain a written hazard communication program at each workplace describing labeling, SDS, and training procedures.',
    action: 'Develop and implement a written hazard communication program that addresses labeling, SDS access, and employee training.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(e)(1)', title: 'Written Hazard Communication Program', authority: 'OSHA', summary: 'Every workplace with hazardous chemicals must have a written plan.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'HAZCOM-002', title: 'Container labeling system not defined',
    classification: 'regulatory_deficiency', severity: 'high', confidence: 0.90, escalation: false,
    evidence: 'No container labeling system was clearly defined in the submitted materials.',
    why: 'Without proper labels, employees may not be aware of chemical hazards they encounter. 29 CFR 1910.1200(f) requires GHS-aligned labeling on all hazardous chemical containers.',
    action: 'Establish GHS-compliant container labeling procedures including product identifier, signal word, hazard statements, pictograms, and precautionary statements.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(f)', title: 'Labels and Other Forms of Warning', authority: 'OSHA', summary: 'All containers of hazardous chemicals must have proper GHS-aligned labels.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'HAZCOM-003', title: 'SDS access method not clearly defined',
    classification: 'regulatory_deficiency', severity: 'high', confidence: 0.85, escalation: false,
    evidence: 'The method for ensuring employee access to Safety Data Sheets was not clearly defined in the submitted materials.',
    why: 'Employees must be able to access SDSs during each work shift per 29 CFR 1910.1200(g)(8). Without a defined access method, employees may not know where to find critical chemical hazard information.',
    action: 'Define and communicate a clear SDS access method (physical binder location, electronic system, or both) and ensure accessibility during all shifts.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(g)(8)', title: 'Safety Data Sheets', authority: 'OSHA', summary: 'Employers must keep SDSs accessible during each work shift.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'HAZCOM-004', title: 'Employee training program not documented',
    classification: 'regulatory_deficiency', severity: 'critical', confidence: 0.95, escalation: false,
    evidence: 'No employee training program for hazardous chemicals was clearly documented in the submitted materials.',
    why: '29 CFR 1910.1200(h)(1) requires employers to provide effective information and training on hazardous chemicals in the work area at initial assignment and when new hazards are introduced.',
    action: 'Develop and document a comprehensive HazCom training program covering chemical hazards, protective measures, SDS use, and label comprehension.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(h)(1)', title: 'Employee Information and Training', authority: 'OSHA', summary: 'Workers must receive training about chemical hazards at initial assignment.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'HAZCOM-005', title: 'Training timing requirements not specified',
    classification: 'regulatory_deficiency', severity: 'moderate', confidence: 0.80, escalation: false,
    evidence: 'The timing of hazard communication training (initial assignment, new hazards) was not specified in the submitted materials.',
    why: 'Training must occur at time of initial assignment and whenever a new chemical hazard is introduced per 29 CFR 1910.1200(h)(1).',
    action: 'Specify training timing requirements in the written program including initial assignment training and new hazard notifications.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(h)(1)', title: 'Employee Information and Training', authority: 'OSHA', summary: 'Training required at initial assignment and for new hazards.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'HAZCOM-006', title: 'Non-routine task hazard communication not addressed',
    classification: 'best_practice_improvement', severity: 'moderate', confidence: 0.75, escalation: false,
    evidence: 'Procedures for communicating hazards associated with non-routine tasks were not addressed in the submitted materials.',
    why: 'Employees performing unusual tasks may encounter unfamiliar chemical hazards. Addressing non-routine task hazards strengthens the overall hazard communication program.',
    action: 'Add procedures for identifying and communicating hazards during non-routine tasks to the written HazCom program.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(e)', title: 'Written Hazard Communication Program', authority: 'OSHA', summary: 'Written program should address all workplace chemical hazard scenarios.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'HAZCOM-007', title: 'Multi-employer workplace communication not addressed',
    classification: 'best_practice_improvement', severity: 'low', confidence: 0.70, escalation: false,
    evidence: 'Procedures for multi-employer hazard communication were not addressed in the submitted materials.',
    why: 'Contractors and other employers at shared sites need access to chemical hazard information per 29 CFR 1910.1200(e)(2).',
    action: 'Establish contractor hazard communication procedures for multi-employer worksites.',
    citations: [{ short: 'OSHA 29 CFR 1910.1200(e)(2)', title: 'Written Hazard Communication Program', authority: 'OSHA', summary: 'Multi-employer sites must share hazard information.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200' }],
  },
  {
    code: 'VENT-62.1-001', title: 'Ventilation basis not referenced',
    classification: 'technical_benchmark_gap', severity: 'low', confidence: 0.60, escalation: false,
    evidence: 'No ventilation basis was identified in the submitted materials.',
    why: 'Understanding the ventilation design basis helps contextualize indoor air quality conditions. ASHRAE 62.1 provides the benchmark for nonresidential ventilation.',
    action: 'Consider documenting the ventilation design basis and referencing applicable standards.',
    citations: [{ short: 'ASHRAE 62.1-2022', title: 'Ventilation for Acceptable Indoor Air Quality', authority: 'ASHRAE', summary: 'Sets minimum ventilation requirements for commercial buildings.', url: 'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2' }],
  },
];

const FACTS = [
  { key: 'written_program', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
  { key: 'labeling_system', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
  { key: 'sds_access', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
  { key: 'employee_training', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
  { key: 'training_timing', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
  { key: 'nonroutine_task_communication', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
  { key: 'contractor_communication', value: 'Not found', status: 'not_found' as const, confidence: 0, excerpt: '' },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const sevColor: Record<string, string> = {
  critical: 'bg-red-600', high: 'bg-orange-500', moderate: 'bg-amber-500',
  low: 'bg-blue-500', informational: 'bg-gray-400',
};
const sevBadge: Record<string, string> = {
  critical: 'bg-red-50 text-red-700', high: 'bg-orange-50 text-orange-700',
  moderate: 'bg-amber-50 text-amber-700', low: 'bg-blue-50 text-blue-700',
  informational: 'bg-gray-50 text-gray-600',
};
const classBadge: Record<string, string> = {
  regulatory_deficiency: 'bg-red-50 text-red-700',
  technical_benchmark_gap: 'bg-amber-50 text-amber-700',
  best_practice_improvement: 'bg-blue-50 text-blue-700',
  unable_to_determine: 'bg-gray-50 text-gray-600',
  expert_review_required: 'bg-purple-50 text-purple-700',
};
const classLabel: Record<string, string> = {
  regulatory_deficiency: 'Regulatory Deficiency',
  technical_benchmark_gap: 'Technical Benchmark Gap',
  best_practice_improvement: 'Best Practice',
  unable_to_determine: 'Unable to Determine',
  expert_review_required: 'Expert Review Required',
};
const factStatusBadge: Record<string, string> = {
  confirmed: 'bg-green-50 text-green-700', inferred: 'bg-yellow-50 text-yellow-700',
  not_found: 'bg-red-50 text-red-700', contradicted: 'bg-purple-50 text-purple-700',
};

function scoreColor(s: number) {
  if (s >= 80) return 'text-green-600';
  if (s >= 60) return 'text-amber-600';
  return 'text-red-600';
}

/* ------------------------------------------------------------------ */
/* Page Component                                                      */
/* ------------------------------------------------------------------ */

export default function ReviewResultPage() {
  const [tab, setTab] = useState<'overview' | 'findings' | 'facts' | 'citations' | 'expert'>('overview');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState('all');
  const [sevFilter, setSevFilter] = useState('all');
  const [drawerCitation, setDrawerCitation] = useState<Finding['citations'][0] | null>(null);

  const filteredFindings = FINDINGS.filter((f) => {
    if (classFilter !== 'all' && f.classification !== classFilter) return false;
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false;
    return true;
  });

  const sevCounts = { critical: 2, high: 2, moderate: 2, low: 1, informational: 1 };
  const classCounts = { regulatory_deficiency: 5, technical_benchmark_gap: 1, best_practice_improvement: 2 };

  return (
    <div className="relative">
      {/* Back + Header */}
      <Link href="/reviews" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Reviews
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{REVIEW.fileName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>{REVIEW.documentType}</span>
            <span className="text-gray-300">|</span>
            <span>{REVIEW.standardTrack}</span>
            <span className="text-gray-300">|</span>
            <span>{REVIEW.reviewDate}</span>
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Completed</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Score</p>
            <p className={`text-3xl font-bold ${scoreColor(REVIEW.overallScore)}`}>{REVIEW.overallScore}</p>
          </div>
        </div>
      </div>

      {/* Exports */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: 'PDF', icon: Download },
          { label: 'DOCX', icon: FileText },
          { label: 'JSON', icon: Braces },
          { label: 'CSV', icon: Table2 },
        ].map((ex) => (
          <button key={ex.label} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <ex.icon className="h-3.5 w-3.5" /> {ex.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs italic text-gray-400">
        Based on the materials reviewed. This does not constitute a compliance determination.
      </p>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          ['overview', 'Overview'], ['findings', 'Findings'], ['facts', 'Extracted Facts'],
          ['citations', 'Citations'], ['expert', 'Expert Review'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {/* =================== OVERVIEW =================== */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Summary</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                Based on the materials reviewed, the intelligence engine identified 8 finding(s) across the Hazard Communication review track.
                Of these, 2 are classified as critical severity and 2 as high severity.
                5 finding(s) relate to potential regulatory deficiencies that may warrant review by a qualified EHS professional.
                1 finding represents a technical benchmark gap relative to ASHRAE 62.1.
                This analysis is reference-backed and does not constitute a compliance determination or legal conclusion.
              </p>
            </div>

            {/* Severity Breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Findings by Severity</h3>
              <div className="space-y-3">
                {Object.entries(sevCounts).map(([sev, count]) => (
                  <div key={sev} className="flex items-center gap-3">
                    <span className="w-28 text-sm capitalize text-gray-600">{sev}</span>
                    <div className="flex-1">
                      <div className="h-5 rounded-full bg-gray-100">
                        <div className={`h-5 rounded-full ${sevColor[sev]}`} style={{ width: `${(count / 8) * 100}%`, minWidth: count > 0 ? '24px' : '0' }} />
                      </div>
                    </div>
                    <span className="w-8 text-right text-sm font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Classification Breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">Findings by Classification</h3>
              <div className="space-y-3">
                {Object.entries(classCounts).map(([cls, count]) => (
                  <div key={cls} className="flex items-center gap-3">
                    <span className="w-44 text-sm text-gray-600">{classLabel[cls]}</span>
                    <div className="flex-1">
                      <div className="h-5 rounded-full bg-gray-100">
                        <div className={`h-5 rounded-full ${cls === 'regulatory_deficiency' ? 'bg-red-600' : cls === 'technical_benchmark_gap' ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${(count / 8) * 100}%`, minWidth: count > 0 ? '24px' : '0' }} />
                      </div>
                    </div>
                    <span className="w-8 text-right text-sm font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Total Findings', value: '8', color: 'border-blue-500' },
                { label: 'Citation Coverage', value: '87%', color: 'border-green-500' },
                { label: 'Escalations', value: '0', color: 'border-purple-500' },
                { label: 'Rule Packs', value: '1', color: 'border-amber-500' },
              ].map((m) => (
                <div key={m.label} className={`rounded-xl border-l-4 ${m.color} bg-white p-4 shadow-sm`}>
                  <p className="text-xs text-gray-500">{m.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================== FINDINGS =================== */}
        {tab === 'findings' && (
          <div>
            <div className="mb-4 flex flex-wrap gap-3">
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm">
                <option value="all">All Classifications</option>
                <option value="regulatory_deficiency">Regulatory Deficiency</option>
                <option value="technical_benchmark_gap">Technical Benchmark Gap</option>
                <option value="best_practice_improvement">Best Practice</option>
              </select>
              <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm">
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
              <span className="ml-auto self-center text-sm text-gray-500">{filteredFindings.length} findings</span>
            </div>

            <div className="space-y-3">
              {filteredFindings.map((f) => {
                const isOpen = expanded === f.code;
                return (
                  <div key={f.code} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <button onClick={() => setExpanded(isOpen ? null : f.code)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-mono text-xs text-gray-400">{f.code}</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">{f.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classBadge[f.classification]}`}>{classLabel[f.classification]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${sevBadge[f.severity]}`}>{f.severity}</span>
                      <div className="flex items-center gap-1.5" title={`${Math.round(f.confidence * 100)}% confidence`}>
                        <div className="h-1.5 w-12 rounded-full bg-gray-100">
                          <div className={`h-1.5 rounded-full ${f.confidence >= 0.8 ? 'bg-green-500' : f.confidence >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${f.confidence * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{Math.round(f.confidence * 100)}%</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Evidence Basis</h4>
                          <p className="mt-1 text-sm text-gray-700">{f.evidence}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Why It Matters</h4>
                          <p className="mt-1 text-sm text-gray-700">{f.why}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recommended Action</h4>
                          <p className="mt-1 text-sm text-gray-700">{f.action}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Citations</h4>
                          <div className="mt-1 space-y-1">
                            {f.citations.map((c) => (
                              <button key={c.short} onClick={() => setDrawerCitation(c)}
                                className="inline-flex items-center gap-1 rounded bg-gray-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                                <BookOpen className="h-3 w-3" /> {c.short}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =================== EXTRACTED FACTS =================== */}
        {tab === 'facts' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Fact Key</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Value</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {FACTS.map((f) => (
                  <tr key={f.key} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.key}</td>
                    <td className="px-4 py-3 text-gray-700">{f.value}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${factStatusBadge[f.status]}`}>
                        {f.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${f.confidence * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{Math.round(f.confidence * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* =================== CITATIONS =================== */}
        {tab === 'citations' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">OSHA References</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { short: 'OSHA 29 CFR 1910.1200(e)(1)', title: 'Written Hazard Communication Program', summary: 'Every workplace with hazardous chemicals must have a written plan.' },
                { short: 'OSHA 29 CFR 1910.1200(f)', title: 'Labels and Other Forms of Warning', summary: 'Containers must have GHS-aligned labels.' },
                { short: 'OSHA 29 CFR 1910.1200(g)(8)', title: 'Safety Data Sheets', summary: 'SDSs must be accessible during each work shift.' },
                { short: 'OSHA 29 CFR 1910.1200(h)(1)', title: 'Employee Information and Training', summary: 'Training required at initial assignment and for new hazards.' },
              ].map((c) => (
                <div key={c.short} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-xs font-medium text-gray-600">{c.short}</span>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">OSHA</span>
                  </div>
                  <h4 className="mt-2 text-sm font-medium text-gray-900">{c.title}</h4>
                  <p className="mt-1 text-xs text-gray-500">{c.summary}</p>
                </div>
              ))}
            </div>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-gray-400">ASHRAE References</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <span className="font-mono text-xs font-medium text-gray-600">ASHRAE 62.1-2022</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">ASHRAE</span>
                </div>
                <h4 className="mt-2 text-sm font-medium text-gray-900">Ventilation for Acceptable Indoor Air Quality</h4>
                <p className="mt-1 text-xs text-gray-500">Sets minimum ventilation requirements for commercial buildings.</p>
              </div>
            </div>
          </div>
        )}

        {/* =================== EXPERT REVIEW =================== */}
        {tab === 'expert' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Expert Escalations</h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              All findings were classified with sufficient confidence. No items were flagged for professional review.
            </p>
          </div>
        )}
      </div>

      {/* =================== CITATION DRAWER =================== */}
      {drawerCitation && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDrawerCitation(null)} />
          <div className="relative w-full max-w-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Citation Detail</h3>
              <button onClick={() => setDrawerCitation(null)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-6">
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Citation</span>
                <p className="mt-1 font-mono text-sm font-medium text-gray-900">{drawerCitation.short}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Title</span>
                <p className="mt-1 text-sm text-gray-700">{drawerCitation.title}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Authority</span>
                <p className="mt-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${drawerCitation.authority === 'OSHA' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                    {drawerCitation.authority}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Plain Language Summary</span>
                <p className="mt-1 text-sm text-gray-700">{drawerCitation.summary}</p>
              </div>
              {drawerCitation.url && (
                <a href={drawerCitation.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> View Official Source
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
