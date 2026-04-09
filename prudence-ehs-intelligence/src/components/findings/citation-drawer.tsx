'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { X, ExternalLink, BookOpen, Scale, FileText } from 'lucide-react';
import type { CitationLink, Reference } from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface CitationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  citation: CitationLink | null;
  reference?: Reference | null;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function CitationDrawer({
  open,
  onOpenChange,
  citation,
  reference,
}: CitationDrawerProps) {
  if (!citation) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />

        {/* Slide-in panel from right */}
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'duration-300'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-gray-900">
                Citation Details
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-sm text-gray-500">
                {citation.shortCitation}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Short citation */}
            <section>
              <SectionLabel icon={BookOpen}>Short Citation</SectionLabel>
              <p className="text-sm font-medium text-gray-900">
                {citation.shortCitation}
              </p>
            </section>

            {/* Reference details (when loaded) */}
            {reference && (
              <>
                <section>
                  <SectionLabel icon={FileText}>Source Title</SectionLabel>
                  <p className="text-sm text-gray-800">{reference.title}</p>
                </section>

                <section>
                  <SectionLabel icon={Scale}>Authority</SectionLabel>
                  <p className="text-sm text-gray-800">
                    {reference.authorityName}
                  </p>
                  <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {reference.authorityType.replace(/_/g, ' ')}
                  </span>
                </section>

                {reference.plainLanguageSummary && (
                  <section>
                    <SectionLabel>Plain Language Summary</SectionLabel>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {reference.plainLanguageSummary}
                    </p>
                  </section>
                )}
              </>
            )}

            {/* Supporting evidence excerpt */}
            {citation.supportingExcerpt && (
              <section>
                <SectionLabel>Supporting Evidence</SectionLabel>
                <blockquote className="rounded-lg border-l-4 border-blue-300 bg-blue-50/50 py-3 pl-4 pr-3">
                  <p className="text-sm italic text-gray-700 leading-relaxed">
                    {citation.supportingExcerpt}
                  </p>
                </blockquote>
              </section>
            )}

            {/* Link to source */}
            {reference?.officialSourceUrl && (
              <section>
                <a
                  href={reference.officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:border-blue-200"
                >
                  View Official Source
                  <ExternalLink className="h-4 w-4" />
                </a>
              </section>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─────────────────────────────────────────────────────────────
// Internal sub-component
// ─────────────────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </div>
  );
}
