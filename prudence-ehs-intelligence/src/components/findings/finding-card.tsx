'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  SeverityBadge,
  ClassificationBadge,
} from '@/components/ui/badge';
import {
  ChevronDown,
  AlertTriangle,
  BookOpen,
  Lightbulb,
  Shield,
  ExternalLink,
} from 'lucide-react';
import type {
  Finding,
  CitationLink,
  FindingClassification,
  FindingSeverity,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const severityKey = (s: FindingSeverity) =>
  s.toLowerCase() as 'critical' | 'high' | 'moderate' | 'low' | 'informational';

const classificationKey = (c: FindingClassification) =>
  c.toLowerCase() as
    | 'regulatory_deficiency'
    | 'technical_benchmark_gap'
    | 'best_practice_improvement'
    | 'unable_to_determine'
    | 'expert_review_required';

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 85
      ? 'bg-emerald-500'
      : pct >= 60
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-gray-200">
        <div
          className={cn('h-full rounded-full', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-500">{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface FindingCardProps {
  finding: Finding;
  onCitationClick?: (citation: CitationLink) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function FindingCard({
  finding,
  onCitationClick,
  className,
}: FindingCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md',
        finding.escalation && 'ring-1 ring-purple-300',
        className
      )}
    >
      {/* ── Header (always visible) ──────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-4 p-5 text-left"
      >
        <div className="min-w-0 flex-1 space-y-2">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-gray-400">
              {finding.findingCode}
            </span>
            <ClassificationBadge
              classification={classificationKey(finding.classification)}
            />
            <SeverityBadge severity={severityKey(finding.severity)} />
            {finding.escalation && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 border border-purple-200">
                <AlertTriangle className="h-3 w-3" />
                Escalated
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {finding.title}
          </h3>

          {/* Confidence */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Confidence</span>
            {confidenceBar(finding.confidence)}
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* ── Expanded details ─────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">
          {/* Evidence basis */}
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <BookOpen className="h-3.5 w-3.5" />
              Evidence Basis
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {finding.evidenceBasis}
            </p>
          </section>

          {/* Why it matters */}
          {finding.whyItMatters && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <Lightbulb className="h-3.5 w-3.5" />
                Why It Matters
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {finding.whyItMatters}
              </p>
            </section>
          )}

          {/* Recommended action */}
          {finding.recommendedAction && (
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <Shield className="h-3.5 w-3.5" />
                Recommended Action
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {finding.recommendedAction}
              </p>
            </section>
          )}

          {/* Citations */}
          {finding.citationLinks && finding.citationLinks.length > 0 && (
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Citations
              </div>
              <div className="flex flex-wrap gap-2">
                {finding.citationLinks.map((citation) => (
                  <button
                    key={citation.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCitationClick?.(citation);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:border-blue-200"
                  >
                    {citation.shortCitation}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Escalation reason */}
          {finding.escalation && finding.escalationReason && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
              <p className="text-xs font-semibold text-purple-700 mb-1">
                Escalation Reason
              </p>
              <p className="text-sm text-purple-800">
                {finding.escalationReason}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
