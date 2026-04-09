'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { SeverityBadge, ClassificationBadge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, ArrowUpDown } from 'lucide-react';
import type {
  Finding,
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

const severityOrder: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  LOW: 3,
  INFORMATIONAL: 4,
};

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface FindingsTableProps {
  findings: Finding[];
  onRowClick?: (finding: Finding) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

type SortField = 'severity' | 'confidence' | 'code';
type SortDir = 'asc' | 'desc';

export function FindingsTable({
  findings,
  onRowClick,
  className,
}: FindingsTableProps) {
  const [classificationFilter, setClassificationFilter] =
    React.useState<string>('all');
  const [severityFilter, setSeverityFilter] = React.useState<string>('all');
  const [sortField, setSortField] = React.useState<SortField>('severity');
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');

  // ── Filter ──────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let result = findings;
    if (classificationFilter !== 'all') {
      result = result.filter(
        (f) => f.classification === classificationFilter
      );
    }
    if (severityFilter !== 'all') {
      result = result.filter((f) => f.severity === severityFilter);
    }
    return result;
  }, [findings, classificationFilter, severityFilter]);

  // ── Sort ────────────────────────────────────────────────
  const sorted = React.useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      switch (sortField) {
        case 'severity':
          return (
            ((severityOrder[a.severity] ?? 99) -
              (severityOrder[b.severity] ?? 99)) *
            dir
          );
        case 'confidence':
          return (a.confidence - b.confidence) * dir;
        case 'code':
          return a.findingCode.localeCompare(b.findingCode) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            value={classificationFilter}
            onValueChange={setClassificationFilter}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Classifications" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classifications</SelectItem>
              <SelectItem value="REGULATORY_DEFICIENCY">
                Regulatory Deficiency
              </SelectItem>
              <SelectItem value="TECHNICAL_BENCHMARK_GAP">
                Benchmark Gap
              </SelectItem>
              <SelectItem value="BEST_PRACTICE_IMPROVEMENT">
                Best Practice
              </SelectItem>
              <SelectItem value="UNABLE_TO_DETERMINE">Undetermined</SelectItem>
              <SelectItem value="EXPERT_REVIEW_REQUIRED">
                Expert Review
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-44">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MODERATE">Moderate</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="INFORMATIONAL">Informational</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="ml-auto text-xs text-gray-400">
          {sorted.length} of {findings.length} findings
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <SortButton
                  active={sortField === 'code'}
                  dir={sortField === 'code' ? sortDir : undefined}
                  onClick={() => toggleSort('code')}
                >
                  Code
                </SortButton>
              </TableHead>
              <TableHead className="min-w-[200px]">Title</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>
                <SortButton
                  active={sortField === 'severity'}
                  dir={sortField === 'severity' ? sortDir : undefined}
                  onClick={() => toggleSort('severity')}
                >
                  Severity
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton
                  active={sortField === 'confidence'}
                  dir={sortField === 'confidence' ? sortDir : undefined}
                  onClick={() => toggleSort('confidence')}
                >
                  Confidence
                </SortButton>
              </TableHead>
              <TableHead className="w-12 text-center">Esc.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-gray-400"
                >
                  No findings match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((finding) => (
                <TableRow
                  key={finding.id}
                  className={cn(
                    'cursor-pointer',
                    finding.escalation && 'bg-purple-50/30'
                  )}
                  onClick={() => onRowClick?.(finding)}
                >
                  <TableCell className="font-mono text-xs text-gray-500">
                    {finding.findingCode}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-gray-900">
                    {finding.title}
                  </TableCell>
                  <TableCell>
                    <ClassificationBadge
                      classification={classificationKey(finding.classification)}
                    />
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={severityKey(finding.severity)} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">
                      {Math.round(finding.confidence * 100)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {finding.escalation && (
                      <AlertTriangle className="mx-auto h-4 w-4 text-purple-500" />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sort button
// ─────────────────────────────────────────────────────────────

function SortButton({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir?: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider',
        active ? 'text-gray-900' : 'text-gray-500'
      )}
    >
      {children}
      <ArrowUpDown
        className={cn(
          'h-3 w-3',
          active ? 'text-blue-500' : 'text-gray-300',
          active && dir === 'desc' && 'rotate-180'
        )}
      />
    </button>
  );
}
