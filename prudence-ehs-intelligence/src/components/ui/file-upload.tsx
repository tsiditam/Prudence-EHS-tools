'use client';

import * as React from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { cn } from '@/lib/utils';
import { Upload, FileText, FileIcon, X } from 'lucide-react';

const ACCEPTED_TYPES: Accept = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'text/plain': ['.txt'],
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type === 'application/pdf') return FileText;
  return FileIcon;
}

export interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileClear?: () => void;
  selectedFile?: File | null;
  maxSizeMb?: number;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  onFileClear,
  selectedFile,
  maxSizeMb = 25,
  disabled = false,
  className,
}: FileUploadProps) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      accept: ACCEPTED_TYPES,
      maxFiles: 1,
      maxSize: maxSizeMb * 1024 * 1024,
      disabled,
      onDrop: (accepted) => {
        if (accepted.length > 0) {
          onFileSelect(accepted[0]);
        }
      },
    });

  const rejectionMessage =
    fileRejections.length > 0
      ? fileRejections[0].errors.map((e) => e.message).join('. ')
      : null;

  // ── File selected state ──────────────────────────────────
  if (selectedFile) {
    const Icon = getFileIcon(selectedFile.type);
    return (
      <div
        className={cn(
          'rounded-xl border border-gray-200 bg-white p-4',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatFileSize(selectedFile.size)}
            </p>
          </div>
          {onFileClear && (
            <button
              type="button"
              onClick={onFileClear}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove file</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Dropzone state ────────────────────────────────────────
  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors',
          isDragActive
            ? 'border-blue-400 bg-blue-50/50'
            : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50/50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <div className="rounded-full bg-gray-50 p-3">
          <Upload
            className={cn(
              'h-6 w-6',
              isDragActive ? 'text-blue-500' : 'text-gray-400'
            )}
          />
        </div>
        <p className="mt-3 text-sm font-medium text-gray-700">
          {isDragActive ? 'Drop your file here' : 'Drag and drop your file here'}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          or click to browse. PDF, DOCX, or TXT up to {maxSizeMb}MB
        </p>
      </div>

      {rejectionMessage && (
        <p className="mt-2 text-xs text-red-600">{rejectionMessage}</p>
      )}
    </div>
  );
}
