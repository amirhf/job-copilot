'use client';

import React, { useState } from 'react';
import { X, Copy, Check, FileDown, ExternalLink } from 'lucide-react';
import type { AnsweredScreeningQuestion } from '@job-copilot/db';

export interface CopyPasteApplyKitProps {
  jobId: string;
  companyName: string;
  jobTitle: string;
  applicationUrl: string;
  candidate: {
    fullName: string;
    email: string;
    phone?: string | null;
    locationCity: string;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
  };
  screeningAnswers: AnsweredScreeningQuestion[];
  onClose: () => void;
}

export function CopyPasteApplyKitDrawer({
  jobId,
  companyName,
  jobTitle,
  applicationUrl,
  candidate,
  screeningAnswers,
  onClose,
}: CopyPasteApplyKitProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copyToClipboard(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  }

  const identityItems = [
    { key: 'fullName', label: 'Full Name', value: candidate.fullName },
    { key: 'email', label: 'Email', value: candidate.email },
    { key: 'phone', label: 'Phone', value: candidate.phone ?? '' },
    { key: 'location', label: 'Location', value: candidate.locationCity },
    { key: 'linkedin', label: 'LinkedIn URL', value: candidate.linkedinUrl ?? '' },
    { key: 'github', label: 'GitHub URL', value: candidate.githubUrl ?? '' },
    { key: 'portfolio', label: 'Portfolio URL', value: candidate.portfolioUrl ?? '' },
  ].filter((item) => Boolean(item.value));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-slate-950 border-l border-slate-800 h-full flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              Mode 2: 1-Click Copy-Paste Kit
            </span>
            <h3 className="text-base font-semibold text-slate-100">
              {jobTitle} @ {companyName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <span>Open Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Draggable / Downloadable PDF Chips */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Compiled Vector PDFs (Drag or Download)
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={`/api/applications/${jobId}/pdf?type=resume`}
                download={`Resume_${candidate.fullName.replace(/\s+/g, '')}_${companyName.replace(/\s+/g, '')}.pdf`}
                draggable
                className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 hover:border-emerald-600 text-xs text-emerald-200"
              >
                <span className="font-medium truncate">
                  Resume_{companyName}.pdf
                </span>
                <FileDown className="w-4 h-4 shrink-0 text-emerald-400" />
              </a>

              <a
                href={`/api/applications/${jobId}/pdf?type=cover-letter`}
                download={`CoverLetter_${candidate.fullName.replace(/\s+/g, '')}_${companyName.replace(/\s+/g, '')}.pdf`}
                draggable
                className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 hover:border-indigo-600 text-xs text-indigo-200"
              >
                <span className="font-medium truncate">
                  CoverLetter_{companyName}.pdf
                </span>
                <FileDown className="w-4 h-4 shrink-0 text-indigo-400" />
              </a>
            </div>
          </div>

          {/* Quick-Copy Identity Strip */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Quick-Copy Identity Strip
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {identityItems.map((item) => {
                const isCopied = copiedKey === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => copyToClipboard(item.key, item.value)}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-xs cursor-pointer"
                  >
                    <div className="truncate pr-2">
                      <div className="text-[10px] text-slate-400">{item.label}</div>
                      <div className="text-slate-200 font-medium truncate">
                        {item.value}
                      </div>
                    </div>
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Screening Q&A Copy Cards */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Tailored Screening Question Answers ({screeningAnswers.length})
            </h4>
            {screeningAnswers.map((qa, idx) => {
              const answerText = qa.userEditedAnswer ?? qa.draftedAnswer;
              const copyId = `qa_${qa.questionId}`;
              const isCopied = copiedKey === copyId;

              return (
                <div
                  key={qa.questionId}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      Q{idx + 1}: {qa.questionLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(copyId, answerText)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium shrink-0 cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy (Cmd+{idx + 1})</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {answerText}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
