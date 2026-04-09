'use client';

import { useState, useCallback } from 'react';
import {
  Upload,
  FileText,
  Settings2,
  PlayCircle,
  Check,
  ChevronRight,
  X,
  AlertCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Config data                                                        */
/* ------------------------------------------------------------------ */

const reviewTypes = ['OSHA Program Review', 'IAQ / Ventilation Review'] as const;

type ReviewType = (typeof reviewTypes)[number];

const tracksByType: Record<ReviewType, string[]> = {
  'OSHA Program Review': [
    'Hazard Communication',
    'Lockout/Tagout',
    'Emergency Action Plan',
    'Respiratory Protection',
  ],
  'IAQ / Ventilation Review': [
    'ASHRAE 62.1 Nonresidential',
    'ASHRAE 62.2 Residential',
    'ASHRAE 55 Thermal Comfort',
    'ASHRAE 241 Infectious Aerosol',
  ],
};

const audiences = [
  'Technical Professional',
  'Executive',
  'Worker',
  'Supervisor',
  'Regulator',
];

const readingLevels = [
  'Grade 5-6',
  'Grade 8',
  'High School',
  'Technical Professional',
  'Executive Concise',
  'Regulator Formal',
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FormData {
  file: File | null;
  reviewType: ReviewType | '';
  track: string;
  audience: string;
  readingLevel: string;
  company: string;
  site: string;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name: string) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NewReviewPage() {
  const [step, setStep] = useState(1);
  const [dragActive, setDragActive] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormData>({
    file: null,
    reviewType: '',
    track: '',
    audience: '',
    readingLevel: '',
    company: '',
    site: '',
  });

  /* ---- File handling ---- */

  const handleFile = useCallback((file: File) => {
    const ext = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_TYPES.includes(file.type)) {
      setErrors((e) => ({
        ...e,
        file: 'Please upload a PDF, DOCX, or TXT file.',
      }));
      return;
    }
    setErrors((e) => {
      const { file: _, ...rest } = e;
      return rest;
    });
    setForm((f) => ({ ...f, file }));
    setStep(2);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  /* ---- Validation ---- */

  function validateStep2(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.reviewType) newErrors.reviewType = 'Please select a review type.';
    if (!form.track) newErrors.track = 'Please select an authority track.';
    if (!form.audience) newErrors.audience = 'Please select an output audience.';
    if (!form.readingLevel)
      newErrors.readingLevel = 'Please select a reading level.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function goToStep3() {
    if (validateStep2()) setStep(3);
  }

  function handleRun() {
    // Placeholder — would trigger API call
    alert('Review submitted. This is a placeholder — the API integration is pending.');
  }

  /* ---- Step indicator ---- */

  const steps = [
    { num: 1, label: 'Upload', icon: Upload },
    { num: 2, label: 'Configure', icon: Settings2 },
    { num: 3, label: 'Review', icon: PlayCircle },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">New Review</h1>
        <p className="page-description">
          Upload a document and configure your review
        </p>
      </div>

      {/* Step indicator */}
      <nav className="flex items-center justify-center gap-0">
        {steps.map((s, i) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div key={s.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isDone
                      ? 'bg-brand-600 text-white'
                      : isActive
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : s.num}
                </span>
                <span
                  className={`text-sm font-medium ${
                    isActive || isDone ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="mx-4 h-4 w-4 text-gray-300" />
              )}
            </div>
          );
        })}
      </nav>

      {/* ============================================================ */}
      {/*  STEP 1 — Upload                                             */}
      {/* ============================================================ */}
      {step === 1 && (
        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Upload Document
          </h2>
          <p className="mb-6 mt-1 text-xs text-gray-400">
            Drag and drop or click to browse. Accepts PDF, DOCX, and TXT.
          </p>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 transition-colors ${
              dragActive
                ? 'border-brand-400 bg-brand-50/50'
                : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
            }`}
          >
            <Upload
              className={`mb-4 h-10 w-10 ${
                dragActive ? 'text-brand-500' : 'text-gray-300'
              }`}
            />
            <span className="text-sm font-medium text-gray-600">
              Drop your file here, or{' '}
              <span className="text-brand-600 underline underline-offset-2">
                browse
              </span>
            </span>
            <span className="mt-1 text-xs text-gray-400">
              PDF, DOCX, or TXT up to 25 MB
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={onFileInput}
            />
          </label>

          {errors.file && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {errors.file}
            </p>
          )}

          {form.file && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <FileText className="h-5 w-5 flex-shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {form.file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(form.file.size)} &middot;{' '}
                  {fileExtension(form.file.name).replace('.', '').toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, file: null }));
                  setStep(1);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/*  STEP 2 — Configure                                          */}
      {/* ============================================================ */}
      {step === 2 && (
        <div className="rounded-xl bg-white p-8 shadow-sm">
          {/* File summary */}
          {form.file && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <FileText className="h-5 w-5 flex-shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {form.file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(form.file.size)} &middot;{' '}
                  {fileExtension(form.file.name).replace('.', '').toUpperCase()}
                </p>
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-900">
            Review Configuration
          </h2>
          <p className="mb-6 mt-1 text-xs text-gray-400">
            Configure how the document should be analyzed.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Review Type */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Review Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.reviewType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    reviewType: e.target.value as ReviewType,
                    track: '',
                  }))
                }
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${
                  errors.reviewType ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <option value="">Select review type...</option>
                {reviewTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errors.reviewType && (
                <p className="mt-1 text-xs text-red-600">{errors.reviewType}</p>
              )}
            </div>

            {/* Authority Track */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Authority Track <span className="text-red-500">*</span>
              </label>
              <select
                value={form.track}
                disabled={!form.reviewType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, track: e.target.value }))
                }
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${
                  errors.track ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <option value="">
                  {form.reviewType
                    ? 'Select authority track...'
                    : 'Select review type first'}
                </option>
                {form.reviewType &&
                  tracksByType[form.reviewType].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
              </select>
              {errors.track && (
                <p className="mt-1 text-xs text-red-600">{errors.track}</p>
              )}
            </div>

            {/* Output Audience */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Output Audience <span className="text-red-500">*</span>
              </label>
              <select
                value={form.audience}
                onChange={(e) =>
                  setForm((f) => ({ ...f, audience: e.target.value }))
                }
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${
                  errors.audience ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <option value="">Select audience...</option>
                {audiences.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {errors.audience && (
                <p className="mt-1 text-xs text-red-600">{errors.audience}</p>
              )}
            </div>

            {/* Reading Level */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Reading Level <span className="text-red-500">*</span>
              </label>
              <select
                value={form.readingLevel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, readingLevel: e.target.value }))
                }
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${
                  errors.readingLevel ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <option value="">Select reading level...</option>
                {readingLevels.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {errors.readingLevel && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.readingLevel}
                </p>
              )}
            </div>

            {/* Company */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Company / Organization{' '}
                <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Manufacturing"
                value={form.company}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {/* Site */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                Building / Site{' '}
                <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Building 7, Campus North"
                value={form.site}
                onChange={(e) =>
                  setForm((f) => ({ ...f, site: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              onClick={goToStep3}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  STEP 3 — Confirm & Run                                      */}
      {/* ============================================================ */}
      {step === 3 && (
        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Confirm &amp; Run
          </h2>
          <p className="mb-6 mt-1 text-xs text-gray-400">
            Review your selections before running the analysis.
          </p>

          <dl className="divide-y divide-gray-100">
            {[
              { label: 'Document', value: form.file?.name ?? '—' },
              {
                label: 'File Size',
                value: form.file ? formatFileSize(form.file.size) : '—',
              },
              { label: 'Review Type', value: form.reviewType || '—' },
              { label: 'Authority Track', value: form.track || '—' },
              { label: 'Output Audience', value: form.audience || '—' },
              { label: 'Reading Level', value: form.readingLevel || '—' },
              ...(form.company
                ? [{ label: 'Company', value: form.company }]
                : []),
              ...(form.site
                ? [{ label: 'Building / Site', value: form.site }]
                : []),
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-3"
              >
                <dt className="text-xs font-medium text-gray-500">
                  {item.label}
                </dt>
                <dd className="text-sm font-medium text-gray-900">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Disclaimer */}
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-amber-800">
                This tool provides reference-backed analysis. It does not replace
                professional EHS judgment or constitute legal compliance
                determination.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep(2)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              onClick={handleRun}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <PlayCircle className="h-4 w-4" />
              Run Review
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
