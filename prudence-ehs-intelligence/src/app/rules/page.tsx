'use client';

import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Shield,
  Wind,
  Hash,
  FileText,
  AlertTriangle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────

interface Rule {
  code: string;
  description: string;
  classification: 'regulatory_deficiency' | 'technical_benchmark_gap' | 'best_practice_improvement' | 'expert_review_required';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  triggerConditions: string;
  requiredEvidence: number;
  citationCount: number;
}

interface RulePack {
  id: string;
  name: string;
  topic: 'OSHA' | 'ASHRAE';
  ruleCount: number;
  domain: string;
  description: string;
  version: string;
  enabled: boolean;
  rules: Rule[];
}

const rulePacks: RulePack[] = [
  {
    id: 'osha-hazcom',
    name: 'Hazard Communication',
    topic: 'OSHA',
    ruleCount: 7,
    domain: 'Occupational Safety',
    description: 'Rules for chemical hazard communication per 29 CFR 1910.1200, including SDS availability, container labeling, and employee training requirements.',
    version: 'v2.4.0',
    enabled: true,
    rules: [
      { code: 'HAZCOM-001', description: 'Written hazard communication program must be available', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'No written HazCom program found in documentation', requiredEvidence: 2, citationCount: 3 },
      { code: 'HAZCOM-002', description: 'Safety Data Sheets must be accessible to all employees during shift', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'SDS access not confirmed or restricted', requiredEvidence: 2, citationCount: 2 },
      { code: 'HAZCOM-003', description: 'All containers must be labeled per GHS requirements', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'Unlabeled or improperly labeled containers reported', requiredEvidence: 1, citationCount: 2 },
      { code: 'HAZCOM-004', description: 'Initial and refresher HazCom training must be documented', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'Training records missing or outdated', requiredEvidence: 3, citationCount: 2 },
      { code: 'HAZCOM-005', description: 'Chemical inventory list must be current and complete', classification: 'regulatory_deficiency', severity: 'moderate', triggerConditions: 'Chemical inventory not maintained or incomplete', requiredEvidence: 1, citationCount: 1 },
      { code: 'HAZCOM-006', description: 'Secondary containers must include hazard warnings', classification: 'regulatory_deficiency', severity: 'moderate', triggerConditions: 'Secondary containers lack hazard identification', requiredEvidence: 1, citationCount: 2 },
      { code: 'HAZCOM-007', description: 'Non-routine task hazard communication procedures required', classification: 'best_practice_improvement', severity: 'low', triggerConditions: 'No procedure for non-routine chemical tasks', requiredEvidence: 1, citationCount: 1 },
    ],
  },
  {
    id: 'osha-loto',
    name: 'Lockout/Tagout',
    topic: 'OSHA',
    ruleCount: 6,
    domain: 'Occupational Safety',
    description: 'Control of hazardous energy rules per 29 CFR 1910.147, covering energy isolation procedures, periodic inspections, and training.',
    version: 'v2.1.0',
    enabled: true,
    rules: [
      { code: 'LOTO-001', description: 'Written energy control program must exist for all applicable equipment', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'No written LOTO program or procedures found', requiredEvidence: 2, citationCount: 3 },
      { code: 'LOTO-002', description: 'Machine-specific energy control procedures required', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'Generic procedures used instead of machine-specific', requiredEvidence: 2, citationCount: 2 },
      { code: 'LOTO-003', description: 'Annual periodic inspections of energy control procedures', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'No periodic inspection records within past 12 months', requiredEvidence: 2, citationCount: 2 },
      { code: 'LOTO-004', description: 'Authorized employee training and retraining documentation', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'Training records missing or expired', requiredEvidence: 3, citationCount: 2 },
      { code: 'LOTO-005', description: 'Lockout devices must be durable, standardized, and identifiable', classification: 'regulatory_deficiency', severity: 'moderate', triggerConditions: 'Non-compliant lockout devices reported', requiredEvidence: 1, citationCount: 1 },
      { code: 'LOTO-006', description: 'Group lockout procedures for multi-person servicing', classification: 'best_practice_improvement', severity: 'moderate', triggerConditions: 'Multi-person servicing without group LOTO procedure', requiredEvidence: 1, citationCount: 2 },
    ],
  },
  {
    id: 'osha-eap',
    name: 'Emergency Action Plan',
    topic: 'OSHA',
    ruleCount: 5,
    domain: 'Occupational Safety',
    description: 'Emergency action plan requirements per 29 CFR 1910.38, including evacuation procedures, alarm systems, and employee notification.',
    version: 'v1.8.0',
    enabled: true,
    rules: [
      { code: 'EAP-001', description: 'Written emergency action plan required for applicable workplaces', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'No written EAP found in documentation', requiredEvidence: 2, citationCount: 2 },
      { code: 'EAP-002', description: 'Emergency evacuation routes and procedures must be documented', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'Evacuation routes not posted or documented', requiredEvidence: 1, citationCount: 2 },
      { code: 'EAP-003', description: 'Employee alarm system must be operational and distinctive', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'Alarm system not tested or not distinctive', requiredEvidence: 1, citationCount: 1 },
      { code: 'EAP-004', description: 'EAP training required upon plan changes and initial assignment', classification: 'regulatory_deficiency', severity: 'moderate', triggerConditions: 'EAP training records incomplete', requiredEvidence: 2, citationCount: 2 },
      { code: 'EAP-005', description: 'Designated employees for critical plant operations during emergency', classification: 'best_practice_improvement', severity: 'low', triggerConditions: 'No designated personnel for critical operations', requiredEvidence: 1, citationCount: 1 },
    ],
  },
  {
    id: 'osha-resppro',
    name: 'Respiratory Protection',
    topic: 'OSHA',
    ruleCount: 6,
    domain: 'Occupational Safety',
    description: 'Respiratory protection program rules per 29 CFR 1910.134, covering exposure assessments, fit testing, medical evaluations, and program administration.',
    version: 'v2.2.0',
    enabled: true,
    rules: [
      { code: 'RESP-001', description: 'Written respiratory protection program required when respirators are necessary', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'No written respiratory protection program', requiredEvidence: 2, citationCount: 3 },
      { code: 'RESP-002', description: 'Medical evaluation required before fit testing', classification: 'regulatory_deficiency', severity: 'critical', triggerConditions: 'Medical evaluations missing or not documented', requiredEvidence: 2, citationCount: 2 },
      { code: 'RESP-003', description: 'Annual fit testing for tight-fitting respirators', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'Fit test records missing or expired', requiredEvidence: 2, citationCount: 2 },
      { code: 'RESP-004', description: 'Respirator selection based on hazard assessment', classification: 'regulatory_deficiency', severity: 'high', triggerConditions: 'No exposure assessment or incorrect respirator selection', requiredEvidence: 1, citationCount: 2 },
      { code: 'RESP-005', description: 'Respirator maintenance, cleaning, and storage procedures', classification: 'regulatory_deficiency', severity: 'moderate', triggerConditions: 'No maintenance/cleaning schedule documented', requiredEvidence: 1, citationCount: 1 },
      { code: 'RESP-006', description: 'Voluntary use respirator appendix D information provided', classification: 'best_practice_improvement', severity: 'low', triggerConditions: 'Voluntary users not provided Appendix D', requiredEvidence: 1, citationCount: 1 },
    ],
  },
  {
    id: 'ashrae-62.1',
    name: 'ASHRAE 62.1 Nonresidential Ventilation',
    topic: 'ASHRAE',
    ruleCount: 9,
    domain: 'Indoor Air Quality',
    description: 'Ventilation for acceptable indoor air quality in nonresidential buildings, covering outdoor air rates, filtration, and system documentation.',
    version: 'v3.1.0',
    enabled: true,
    rules: [
      { code: 'V62.1-001', description: 'Minimum outdoor air rates must meet Table 6-1 requirements', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'OA rates below Table 6-1 minimums', requiredEvidence: 2, citationCount: 3 },
      { code: 'V62.1-002', description: 'Ventilation Rate Procedure calculations documented', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'VRP calculations not documented or incorrect', requiredEvidence: 3, citationCount: 2 },
      { code: 'V62.1-003', description: 'Zone air distribution effectiveness considered', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Ez factor not applied or documented', requiredEvidence: 1, citationCount: 2 },
      { code: 'V62.1-004', description: 'System ventilation efficiency calculated for multi-zone systems', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Ev not calculated for multi-zone AHU', requiredEvidence: 2, citationCount: 2 },
      { code: 'V62.1-005', description: 'Minimum filtration/air cleaning requirements met', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'Filter rating below MERV 8 minimum', requiredEvidence: 1, citationCount: 2 },
      { code: 'V62.1-006', description: 'Exhaust air requirements for applicable spaces', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Exhaust rates not meeting Table 6-4', requiredEvidence: 1, citationCount: 1 },
      { code: 'V62.1-007', description: 'Ventilation system documentation and O&M manual required', classification: 'best_practice_improvement', severity: 'moderate', triggerConditions: 'No ventilation O&M manual available', requiredEvidence: 1, citationCount: 1 },
      { code: 'V62.1-008', description: 'Air intake placement per separation distance requirements', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'Intake proximity to contaminant sources', requiredEvidence: 1, citationCount: 2 },
      { code: 'V62.1-009', description: 'DCV (demand control ventilation) required per Section 6.2.7', classification: 'best_practice_improvement', severity: 'low', triggerConditions: 'High-density space without DCV', requiredEvidence: 1, citationCount: 1 },
    ],
  },
  {
    id: 'ashrae-62.2',
    name: 'ASHRAE 62.2 Residential Ventilation',
    topic: 'ASHRAE',
    ruleCount: 5,
    domain: 'Indoor Air Quality',
    description: 'Ventilation and acceptable indoor air quality in residential buildings, covering whole-building and local exhaust requirements.',
    version: 'v2.0.0',
    enabled: true,
    rules: [
      { code: 'V62.2-001', description: 'Whole-building ventilation rate meets Table 4-1a requirements', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'Total ventilation below calculated minimum', requiredEvidence: 2, citationCount: 2 },
      { code: 'V62.2-002', description: 'Local exhaust for kitchens meets minimum cfm', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Kitchen exhaust below 100 cfm intermittent / 25 cfm continuous', requiredEvidence: 1, citationCount: 2 },
      { code: 'V62.2-003', description: 'Local exhaust for bathrooms meets minimum cfm', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Bathroom exhaust below 50 cfm intermittent / 20 cfm continuous', requiredEvidence: 1, citationCount: 2 },
      { code: 'V62.2-004', description: 'Envelope air leakage considered in ventilation calculations', classification: 'best_practice_improvement', severity: 'low', triggerConditions: 'Infiltration credit not assessed or documented', requiredEvidence: 1, citationCount: 1 },
      { code: 'V62.2-005', description: 'Attached garage ventilation isolation requirements', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'Garage not isolated or transfer air not addressed', requiredEvidence: 1, citationCount: 2 },
    ],
  },
  {
    id: 'ashrae-55',
    name: 'ASHRAE 55 Thermal Comfort',
    topic: 'ASHRAE',
    ruleCount: 5,
    domain: 'Indoor Air Quality',
    description: 'Thermal environmental conditions for human occupancy, covering temperature ranges, humidity, and occupant satisfaction.',
    version: 'v1.5.0',
    enabled: true,
    rules: [
      { code: 'TC55-001', description: 'Operative temperature within comfort zone per Section 5.3', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Temperature readings outside comfort envelope', requiredEvidence: 2, citationCount: 2 },
      { code: 'TC55-002', description: 'Humidity ratio not exceeding 0.012 upper limit', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'Humidity ratio above 0.012 kg/kg', requiredEvidence: 1, citationCount: 1 },
      { code: 'TC55-003', description: 'Radiant temperature asymmetry within limits', classification: 'technical_benchmark_gap', severity: 'low', triggerConditions: 'Radiant asymmetry complaints or measurements out of range', requiredEvidence: 1, citationCount: 2 },
      { code: 'TC55-004', description: 'Draft rate (air speed) within acceptable limits', classification: 'technical_benchmark_gap', severity: 'low', triggerConditions: 'Air speed causing draft complaints', requiredEvidence: 1, citationCount: 1 },
      { code: 'TC55-005', description: 'Occupant satisfaction survey recommended for compliance', classification: 'best_practice_improvement', severity: 'low', triggerConditions: 'No occupant comfort survey conducted', requiredEvidence: 1, citationCount: 1 },
    ],
  },
  {
    id: 'ashrae-241',
    name: 'ASHRAE 241 Infectious Aerosol Control',
    topic: 'ASHRAE',
    ruleCount: 8,
    domain: 'Indoor Air Quality',
    description: 'Control of infectious aerosols per ASHRAE Standard 241, covering equivalent clean airflow, infection risk management, and building readiness.',
    version: 'v1.0.0',
    enabled: true,
    rules: [
      { code: 'IAC241-001', description: 'Equivalent clean airflow (ECAi) meets minimum requirements per infection risk mode', classification: 'technical_benchmark_gap', severity: 'critical', triggerConditions: 'ECAi below Table 6-1 minimums for declared risk mode', requiredEvidence: 3, citationCount: 3 },
      { code: 'IAC241-002', description: 'Building Readiness Plan documented and maintained', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'No Building Readiness Plan found', requiredEvidence: 2, citationCount: 2 },
      { code: 'IAC241-003', description: 'Infection Risk Management Plan (IRMP) established', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'No IRMP documented or maintained', requiredEvidence: 2, citationCount: 2 },
      { code: 'IAC241-004', description: 'Air cleaning devices verified for equivalent clean air credit', classification: 'technical_benchmark_gap', severity: 'high', triggerConditions: 'Air cleaner performance not verified or documented', requiredEvidence: 2, citationCount: 2 },
      { code: 'IAC241-005', description: 'Natural ventilation assessment for applicable spaces', classification: 'best_practice_improvement', severity: 'moderate', triggerConditions: 'Natural ventilation used without quantification', requiredEvidence: 1, citationCount: 1 },
      { code: 'IAC241-006', description: 'Upper-room UVGI systems meet safety and efficacy requirements', classification: 'expert_review_required', severity: 'high', triggerConditions: 'UVGI installed without performance verification', requiredEvidence: 2, citationCount: 2 },
      { code: 'IAC241-007', description: 'Monitoring and maintenance of IAQ systems per Section 8', classification: 'technical_benchmark_gap', severity: 'moderate', triggerConditions: 'No monitoring or maintenance log for IAQ systems', requiredEvidence: 1, citationCount: 1 },
      { code: 'IAC241-008', description: 'Commissioning of clean air delivery systems required', classification: 'best_practice_improvement', severity: 'moderate', triggerConditions: 'Clean air systems not commissioned or verified', requiredEvidence: 1, citationCount: 2 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const topicColors: Record<string, string> = {
  OSHA: 'bg-red-100 text-red-800 border border-red-200',
  ASHRAE: 'bg-blue-100 text-blue-800 border border-blue-200',
};

const classificationColors: Record<string, { bg: string; label: string }> = {
  regulatory_deficiency: { bg: 'bg-red-50 text-red-700 border border-red-200', label: 'Regulatory Deficiency' },
  technical_benchmark_gap: { bg: 'bg-amber-50 text-amber-700 border border-amber-200', label: 'Benchmark Gap' },
  best_practice_improvement: { bg: 'bg-blue-50 text-blue-700 border border-blue-200', label: 'Best Practice' },
  expert_review_required: { bg: 'bg-purple-50 text-purple-700 border border-purple-200', label: 'Expert Review' },
};

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border border-red-200',
  high: 'bg-orange-100 text-orange-800 border border-orange-200',
  moderate: 'bg-amber-100 text-amber-800 border border-amber-200',
  low: 'bg-blue-100 text-blue-800 border border-blue-200',
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function RulesPage() {
  const [expandedPacks, setExpandedPacks] = useState<Set<string>>(new Set());
  const [enabledPacks, setEnabledPacks] = useState<Set<string>>(
    new Set(rulePacks.filter((p) => p.enabled).map((p) => p.id))
  );

  function togglePack(id: string) {
    setExpandedPacks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEnabled(id: string) {
    setEnabledPacks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="page-title">Rule Library</h1>
            <p className="page-description">
              Deterministic rule packs that power the review engine
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Hash className="h-4 w-4" />
          <span className="font-medium text-gray-900">{rulePacks.length}</span> rule packs
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FileText className="h-4 w-4" />
          <span className="font-medium text-gray-900">
            {rulePacks.reduce((sum, p) => sum + p.ruleCount, 0)}
          </span>{' '}
          total rules
        </div>
      </div>

      {/* Rule Pack Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {rulePacks.map((pack) => {
          const isExpanded = expandedPacks.has(pack.id);
          const isEnabled = enabledPacks.has(pack.id);

          return (
            <div
              key={pack.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Pack Header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => togglePack(pack.id)}
                    className="flex items-start gap-3 text-left flex-1 min-w-0"
                  >
                    <div className="mt-0.5 flex-shrink-0 text-gray-400">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {pack.name}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${topicColors[pack.topic]}`}
                        >
                          {pack.topic}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                        {pack.description}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {pack.ruleCount} rules
                        </span>
                        <span>{pack.domain}</span>
                        <span className="font-mono">{pack.version}</span>
                        <span className="font-mono text-gray-300">
                          {pack.id}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Enable Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEnabled(pack.id);
                    }}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      isEnabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={isEnabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Expanded Rules */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  <div className="divide-y divide-gray-100">
                    {pack.rules.map((rule) => (
                      <div
                        key={rule.code}
                        className="px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold text-gray-700">
                                {rule.code}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${classificationColors[rule.classification].bg}`}
                              >
                                {classificationColors[rule.classification].label}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${severityColors[rule.severity]}`}
                              >
                                {rule.severity}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                              {rule.description}
                            </p>
                            <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wide">
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Trigger: {rule.triggerConditions}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-4 text-[10px] text-gray-400">
                              <span>
                                {rule.requiredEvidence} evidence item{rule.requiredEvidence !== 1 ? 's' : ''} required
                              </span>
                              <span>{rule.citationCount} citation{rule.citationCount !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
