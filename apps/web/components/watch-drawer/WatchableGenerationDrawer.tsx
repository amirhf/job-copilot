'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowRight,
  FileCode2,
} from 'lucide-react';
import type { JobWithEvaluationAndPackage } from '../../lib/data';
import { GapResolutionCard } from './GapResolutionCard';

interface StreamTimelineEntry {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const GENERATION_STEPS = [
  { key: 'ANALYZING_REQUIREMENTS', label: '1. Analyze Role Blueprint & ATS Keywords' },
  { key: 'GAP_CHECK_AWAITING_USER', label: '2. Critical Skill Gap Gate' },
  { key: 'SELECTING_CAREER_BLOCKS', label: '3. Hybrid RRF Career Block Retrieval' },
  { key: 'SYNTHESIZING_RESUME', label: '4. Grounded Resume Synthesis' },
  { key: 'SYNTHESIZING_COVER_LETTER_AND_QA', label: '5. Cover Letter & Custom Q&A Synthesis' },
  { key: 'COMPILING_AND_AUDITING_PDF', label: '6. Native Typst PDF Compilation & Audit' },
] as const;

export function WatchableGenerationDrawer({
  job,
  availableExperiences,
  onClose,
  onCompletedOrUpdated,
}: {
  job: JobWithEvaluationAndPackage;
  availableExperiences: Array<{ id: string; companyName: string; jobTitle: string }>;
  onClose: () => void;
  onCompletedOrUpdated: () => void;
}) {
  const [events, setEvents] = useState<StreamTimelineEntry[]>([]);
  const [activeStep, setActiveStep] = useState<string>(
    job.latestPackage?.currentStep ?? 'QUEUED'
  );
  const [liveTypstSource, setLiveTypstSource] = useState<string>(
    job.latestPackage?.resumeTypstSource ?? ''
  );
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState<boolean>(
    job.status === 'READY_TO_APPLY' || job.latestPackage?.currentStep === 'COMPLETED'
  );
  const lastSeqRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    const es = new EventSource(
      `/api/applications/${job.id}/stream?afterSeq=${lastSeqRef.current}`
    );

    const handleFrame = (evt: MessageEvent) => {
      if (!active) return;
      try {
        const parsed = JSON.parse(evt.data) as StreamTimelineEntry;
        if (parsed.seq > lastSeqRef.current) {
          lastSeqRef.current = parsed.seq;
        }
        setEvents((prev) => {
          if (prev.some((p) => p.seq === parsed.seq)) return prev;
          return [...prev, parsed];
        });

        const stepName = parsed.payload?.step as string | undefined;
        if (parsed.eventType === 'STEP_STARTED' && stepName) {
          setActiveStep(stepName);
        }
        if (parsed.eventType === 'STEP_FINISHED' && stepName) {
          setCompletedSteps((prev) =>
            prev.includes(stepName) ? prev : [...prev, stepName]
          );
        }
        if (parsed.eventType === 'STATE_DELTA') {
          const typst = parsed.payload?.resumeTypstSource as string | undefined;
          if (typst) {
            setLiveTypstSource(typst);
          }
        }
        if (parsed.eventType === 'RUN_FINISHED') {
          setIsFinished(true);
          setActiveStep('COMPLETED');
          onCompletedOrUpdated();
        }
      } catch {
        // Ignore malformed frame
      }
    };

    const eventTypes = [
      'RUN_STARTED',
      'STEP_STARTED',
      'STEP_FINISHED',
      'STATE_DELTA',
      'INTERRUPT',
      'RUN_FINISHED',
      'RUN_ERROR',
    ];
    for (const t of eventTypes) {
      es.addEventListener(t, handleFrame as EventListener);
    }

    return () => {
      active = false;
      es.close();
    };
  }, [job.id, onCompletedOrUpdated]);

  const unresolvedCriticalGaps = (job.evaluation?.flaggedGaps ?? []).filter(
    (g) => g.severity === 'CRITICAL' && g.resolutionStatus === 'OPEN'
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-6xl bg-slate-950 border-l border-slate-800 h-full flex flex-col">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Watchable Synthesis Stream
              </span>
              <span className="text-xs text-slate-500">
                (Cursor seq #{lastSeqRef.current})
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-100">
              {job.title} @ {job.companyName}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {isFinished && (
              <Link
                href={`/studio/${job.id}`}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <span>Open in Document Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Split Body: Left Timeline & Gap Resolver (45%) | Right Live Typst Preview (55%) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          <div className="lg:col-span-5 border-r border-slate-800 p-5 overflow-y-auto space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pipeline Execution Steps
            </h3>

            <div className="space-y-2.5">
              {GENERATION_STEPS.map((step) => {
                const isDone =
                  isFinished || completedSteps.includes(step.key);
                const isCurrent = !isDone && activeStep === step.key;
                const isInterrupted =
                  step.key === 'GAP_CHECK_AWAITING_USER' &&
                  (job.status === 'PAUSED_NEEDS_INPUT' ||
                    activeStep === 'GAP_CHECK_AWAITING_USER');

                return (
                  <div
                    key={step.key}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                      isInterrupted
                        ? 'bg-amber-950/40 border-amber-700/70 text-amber-200'
                        : isDone
                        ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                        : isCurrent
                        ? 'bg-slate-900 border-emerald-500/60 text-slate-100'
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    <span className="font-medium">{step.label}</span>
                    {isInterrupted ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Inline Gap Resolution Cards when paused */}
            {unresolvedCriticalGaps.map((gap) => (
              <GapResolutionCard
                key={gap.gapId}
                jobPostingId={job.id}
                gap={gap}
                availableExperiences={availableExperiences}
                onResolved={() => {
                  onCompletedOrUpdated();
                }}
              />
            ))}

            {/* Raw AG-UI Event Stream Log */}
            <div className="pt-2 space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Resumable Event Log ({events.length} frames)
              </h4>
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                {events.length === 0 ? (
                  <div className="text-slate-500">
                    Waiting for stream events...
                  </div>
                ) : (
                  events.map((e) => (
                    <div key={e.seq} className="text-slate-300">
                      <span className="text-emerald-400">#{e.seq}</span>{' '}
                      <span className="text-indigo-300">[{e.eventType}]</span>{' '}
                      <span className="text-slate-400">
                        {JSON.stringify(e.payload).slice(0, 110)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Pane: Live Typst Source & Audit Preview */}
          <div className="lg:col-span-7 p-5 overflow-y-auto flex flex-col space-y-4 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <FileCode2 className="w-4 h-4 text-emerald-400" />
                <span>Live Typst Document Stream & Vector PDF Preview</span>
              </div>
              {job.latestPackage?.pdfAudit && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800">
                    {job.latestPackage.pdfAudit.pageCount} Page
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                    ATS Keywords: {job.latestPackage.pdfAudit.atsKeywordCoveragePercent}%
                  </span>
                </div>
              )}
            </div>

            {isFinished ? (
              <iframe
                title="Compiled Resume PDF"
                src={`/api/applications/${job.id}/pdf?type=resume`}
                className="w-full flex-1 min-h-[540px] rounded-xl border border-slate-800 bg-white"
              />
            ) : (
              <pre className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap">
                {liveTypstSource ||
                  '// Typst source will stream here as Step 4 (Synthesize Resume) completes...'}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
