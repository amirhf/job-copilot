'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Play,
  Eye,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { JobWithEvaluationAndPackage } from '../../lib/data';
import { WatchableGenerationDrawer } from '../watch-drawer/WatchableGenerationDrawer';

export function ApprovedQueueClient({
  jobs,
  availableExperiences,
}: {
  jobs: JobWithEvaluationAndPackage[];
  availableExperiences: Array<{ id: string; companyName: string; jobTitle: string }>;
}) {
  const router = useRouter();
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>(
    jobs.filter((j) => j.status === 'APPROVED').map((j) => j.id)
  );
  const [modelTier, setModelTier] = useState<
    'TIER_3_SYNTHESIS_DEFAULT' | 'TIER_3_SYNTHESIS_PREMIER'
  >('TIER_3_SYNTHESIS_DEFAULT');
  const [generating, setGenerating] = useState<boolean>(false);
  const [watchedJobId, setWatchedJobId] = useState<string | null>(null);

  const watchedJob = jobs.find((j) => j.id === watchedJobId) ?? null;

  function toggleJob(id: string) {
    setSelectedJobIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleGenerateBatch(idsToRun: string[]) {
    if (idsToRun.length === 0) return;
    setGenerating(true);
    if (idsToRun.length === 1) {
      setWatchedJobId(idsToRun[0]!);
    }
    try {
      await fetch('/api/applications/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobPostingIds: idsToRun,
          synthesisModelTier: modelTier,
        }),
      });
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Batch Dispatch Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={
                jobs.length > 0 && selectedJobIds.length === jobs.length
              }
              onChange={(e) =>
                setSelectedJobIds(
                  e.target.checked ? jobs.map((j) => j.id) : []
                )
              }
              className="rounded border-slate-700 bg-slate-950 text-emerald-500"
            />
            <span>Select All ({selectedJobIds.length})</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={modelTier}
            onChange={(e) =>
              setModelTier(
                e.target.value as
                  | 'TIER_3_SYNTHESIS_DEFAULT'
                  | 'TIER_3_SYNTHESIS_PREMIER'
              )
            }
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="TIER_3_SYNTHESIS_DEFAULT">
              Model: Claude Sonnet 4.6 (Default Synthesis)
            </option>
            <option value="TIER_3_SYNTHESIS_PREMIER">
              Model: Claude Opus 4.6 (Dream Role Premier)
            </option>
          </select>

          <button
            type="button"
            disabled={selectedJobIds.length === 0 || generating}
            onClick={() => handleGenerateBatch(selectedJobIds)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {generating
                ? 'Synthesizing Materials...'
                : `Generate Materials for Selected (${selectedJobIds.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* Approved & Generating Queue List */}
      {jobs.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-12 text-center">
          <p className="text-slate-300 font-medium">
            No jobs currently in the Approved & Generating Queue
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Approve high-fit roles from the Triage Inbox to trigger tailored Resume, Cover Letter, and Q&A synthesis.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isPaused = job.status === 'PAUSED_NEEDS_INPUT';
            const isGenerating = job.status === 'GENERATING';
            const criticalGaps = (job.evaluation?.flaggedGaps ?? []).filter(
              (g) => g.severity === 'CRITICAL' && g.resolutionStatus === 'OPEN'
            );

            return (
              <div
                key={job.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.includes(job.id)}
                    onChange={() => toggleJob(job.id)}
                    className="mt-1.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />

                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          isPaused
                            ? 'bg-amber-950/70 text-amber-300 border-amber-700'
                            : isGenerating
                            ? 'bg-indigo-950/70 text-indigo-300 border-indigo-700'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {job.status}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {job.title} @ {job.companyName}
                      </h3>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-3">
                      <span>
                        Current Step:{' '}
                        <strong className="text-slate-200">
                          {job.latestPackage?.currentStep ?? 'Awaiting Trigger'}
                        </strong>
                      </span>
                      {criticalGaps.length > 0 && (
                        <span className="text-amber-300 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {criticalGaps.length} Unresolved Critical Gap (
                          {criticalGaps.map((g) => g.missingSkillName).join(', ')})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {job.status === 'APPROVED' && (
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => handleGenerateBatch([job.id])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Generate Now</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setWatchedJobId(job.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                  >
                    {isPaused ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Resolve Gap Inline</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Open Watch Live Drawer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {watchedJob && (
        <WatchableGenerationDrawer
          job={watchedJob}
          availableExperiences={availableExperiences}
          onClose={() => setWatchedJobId(null)}
          onCompletedOrUpdated={() => router.refresh()}
        />
      )}
    </div>
  );
}
