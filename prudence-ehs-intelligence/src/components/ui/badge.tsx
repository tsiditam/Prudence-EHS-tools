import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Severity Badge
// ─────────────────────────────────────────────────────────────

const severityBadgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      severity: {
        critical: 'bg-red-100 text-red-800 border border-red-200',
        high: 'bg-orange-100 text-orange-800 border border-orange-200',
        moderate: 'bg-amber-100 text-amber-800 border border-amber-200',
        low: 'bg-blue-100 text-blue-800 border border-blue-200',
        informational: 'bg-gray-100 text-gray-700 border border-gray-200',
      },
    },
    defaultVariants: {
      severity: 'informational',
    },
  }
);

export interface SeverityBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof severityBadgeVariants> {}

export function SeverityBadge({
  className,
  severity,
  children,
  ...props
}: SeverityBadgeProps) {
  return (
    <span
      className={cn(severityBadgeVariants({ severity }), className)}
      {...props}
    >
      {children ?? severity}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Classification Badge
// ─────────────────────────────────────────────────────────────

const classificationBadgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      classification: {
        regulatory_deficiency:
          'bg-red-50 text-red-700 border border-red-200',
        technical_benchmark_gap:
          'bg-amber-50 text-amber-700 border border-amber-200',
        best_practice_improvement:
          'bg-blue-50 text-blue-700 border border-blue-200',
        unable_to_determine:
          'bg-gray-50 text-gray-600 border border-gray-200',
        expert_review_required:
          'bg-purple-50 text-purple-700 border border-purple-200',
      },
    },
    defaultVariants: {
      classification: 'unable_to_determine',
    },
  }
);

const classificationLabels: Record<string, string> = {
  regulatory_deficiency: 'Regulatory Deficiency',
  technical_benchmark_gap: 'Benchmark Gap',
  best_practice_improvement: 'Best Practice',
  unable_to_determine: 'Undetermined',
  expert_review_required: 'Expert Review',
};

export interface ClassificationBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof classificationBadgeVariants> {}

export function ClassificationBadge({
  className,
  classification,
  children,
  ...props
}: ClassificationBadgeProps) {
  const label =
    children ??
    (classification ? classificationLabels[classification] : 'Unknown');

  return (
    <span
      className={cn(
        classificationBadgeVariants({ classification }),
        className
      )}
      {...props}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Generic Badge (for general use)
// ─────────────────────────────────────────────────────────────

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-700 border border-gray-200',
        primary: 'bg-blue-100 text-blue-800 border border-blue-200',
        success: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
        warning: 'bg-amber-100 text-amber-800 border border-amber-200',
        danger: 'bg-red-100 text-red-800 border border-red-200',
        purple: 'bg-purple-100 text-purple-800 border border-purple-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
