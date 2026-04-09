import * as React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

type AccentColor = 'blue' | 'green' | 'amber' | 'red' | 'purple';

const accentColorMap: Record<AccentColor, string> = {
  blue: 'border-l-blue-500',
  green: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
  purple: 'border-l-purple-500',
};

const changeColorMap = {
  positive: 'text-emerald-600',
  negative: 'text-red-600',
  neutral: 'text-gray-500',
} as const;

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: string | number;
    direction: 'positive' | 'negative' | 'neutral';
  };
  icon?: LucideIcon;
  accentColor?: AccentColor;
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  accentColor = 'blue',
  className,
}: StatCardProps) {
  const ChangeIcon =
    change?.direction === 'positive'
      ? TrendingUp
      : change?.direction === 'negative'
        ? TrendingDown
        : Minus;

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm border-l-4',
        accentColorMap[accentColor],
        className
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="text-3xl font-bold tracking-tight text-gray-900">
              {value}
            </p>
          </div>
          {Icon && (
            <div className="rounded-lg bg-gray-50 p-2.5">
              <Icon className="h-5 w-5 text-gray-400" />
            </div>
          )}
        </div>

        {change && (
          <div className="mt-3 flex items-center gap-1.5">
            <ChangeIcon
              className={cn('h-4 w-4', changeColorMap[change.direction])}
            />
            <span
              className={cn(
                'text-sm font-medium',
                changeColorMap[change.direction]
              )}
            >
              {change.value}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
