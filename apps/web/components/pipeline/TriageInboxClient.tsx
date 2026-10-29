'use client';

import React, { useState, useTransition } from 'react';
import {
  Check,
  X,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  SlidersHorizontal,
} from 'lucide-react';
import type { JobWithEvaluationAndPackage } from '../../lib/data';
import {
  approveJobAction,
  bulkApproveJobsAction,
  rejectJobWithFeedbackAction,
} from '../../actions/triage-actions';

const REJECTION_REASON_CHIPS = [
  'Compensation Too Low',
  'Wrong Core Stack',
  'Seniority Mismatch',
  'Domain/Industry Unappealing',
  'Company Stage/Culture',
  'On-Call/Travel Requirements',
] as const;

export function TriageInboxClient({
  initialJobs,
}: {
  initialJobs: JobWithEvaluationAndPackage[];
}) {
  const [minScore, setMinScore] = useState<number>(0);
  const [remoteFilter, setRemoteFilter] = useState<string>('ALL');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [rejectingJob, setRejectingJob] = useState<JobWithEvaluationAndPackage | null>(
    null
  );
  const [selectedReason, setSelectedReason] = useState<string>(
    REJECTION_REASON_CHIPS[1]
  );
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [learnRule, setLearnRule] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  const filteredJobs = initialJobs.filter((job) => {
    const score = job.evaluation?.overallScore ?? 0;
    if (score < minScore) return false;
    if (remoteFilter !== 'ALL' && job.remotePolicy !== remoteFilter) return false;
    return true;
  });

  function toggleSelection(jobId: string) {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  }

  function handleApprove(jobId: string) {
    startTransition(async () => {
      await approveJobAction(jobId);
      setSelectedJobIds((prev) => prev.filter((id) => id !== jobId));
    });
  }

  function handleBulkApprove() {
    if (selectedJobIds.length === 0) return;
    startTransition(async () => {
      await bulkApproveJobsAction(selectedJobIds);
      setSelectedJobIds([]);
    });
  }

  function handleConfirmReject() {
    if (!rejectingJob) return;
    startTransition(async () => {
      await rejectJobWithFeedbackAction({
        jobPostingId: rejectingJob.id,
        rejectionReasonCategory: selectedReason,
        userFeedbackNote: feedbackNote,
        learnPreferenceRule: learnRule,
      });
      setRejectingJob(null);
      setFeedbackNote('');
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter & Bulk Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value={0}>All Scores</option>
            <option value={70}>Score &ge; 70</option>
            <option value={80}>Score &ge; 80</option>
            <option value={85}>Score &ge; 85</option>
          </select>

          <select
            value={remoteFilter}
            onChange={(e) => setRemoteFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">Remote Policy: All</option>
            <option value="REMOTE">Remote Only</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">Onsite</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={selectedJobIds.length === 0 || isPending}
            onClick={handleBulkApprove}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            Bulk Approve Selected ({selectedJobIds.length})
          </button>
        </div>
      </div>

      {/* Job Cards */}
      {filteredJobs.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-12 text-center">
          <p className="text-slate-300 font-medium">No jobs in Triage Inbox match current filters</p>
          <p className="text-xs text-slate-500 mt-1">
            Click &ldquo;Sync Connectors&rdquo; in the top bar or run <code className="text-slate-300">pnpm db:seed</code> to populate sample postings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const score = job.evaluation?.overallScore ?? 0;
            const scoreBadgeColor =
              score >= 85
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : score >= 70
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700';

            const cats = job.evaluation?.categoryScores;
            const gaps = job.evaluation?.flaggedGaps ?? [];

            return (
              <div
                key={job.id}
                className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <input
                      type="checkbox"
                      checked={selectedJobIds.includes(job.id)}
                      onChange={() => toggleSelection(job.id)}
                      className="mt-2 h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500"
                    />

                    {/* FitScoreBadge */}
                    <div
                      className={`px-3 py-1.5 rounded-lg border text-center min-w-[68px] ${scoreBadgeColor}`}
                    >
                      <div className="text-lg font-bold leading-none">{score}</div>
                      <div className="text-[10px] uppercase tracking-wider opacity-80 mt-0.5">
                        Fit
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-100">
                          {job.title}
                        </h3>
                        <span className="text-slate-400 text-sm">@ {job.companyName}</span>
                        {job.atsPlatform && (
                          <span className="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {job.atsPlatform}
                          </span>
                        )}
                        <a
                          href={job.applicationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 text-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>{job.locationRaw}</span>
                        <span>&bull;</span>
                        <span className="text-slate-300 font-medium">{job.remotePolicy}</span>
                        {(job.salaryMinUsd || job.salaryMaxUsd) && (
                          <>
                            <span>&bull;</span>
                            <span className="text-emerald-400 font-medium">
                              ${Math.round((job.salaryMinUsd ?? 0) / 1000)}k &ndash; $
                              {Math.round((job.salaryMaxUsd ?? job.salaryMinUsd ?? 0) / 1000)}k
                            </span>
                          </>
                        )}
                        {job.extractedQuestions.length > 0 && (
                          <>
                            <span>&bull;</span>
                            <span>{job.extractedQuestions.length} Custom Screening Qs</span>
                          </>
                        )}
                      </div>

                      {cats && (
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5">
                          <span>
                            Tech Stack: <strong className="text-slate-200">{cats.techStackAlignment.score}</strong>
                          </span>
                          <span>
                            Seniority: <strong className="text-slate-200">{cats.seniorityAndScope.score}</strong>
                          </span>
                          <span>
                            Domain: <strong className="text-slate-200">{cats.domainIndustryFit.score}</strong>
                          </span>
                          <span>
                            Stage/Culture: <strong className="text-slate-200">{cats.companyStageCulture.score}</strong>
                          </span>
                        </div>
                      )}

                      {job.evaluation?.executiveSummary && (
                        <p className="text-xs text-slate-300 leading-relaxed pt-1">
                          {job.evaluation.executiveSummary}
                        </p>
                      )}

                      {/* GapAlertPills & Special Instructions */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {gaps.map((gap) => (
                          <span
                            key={gap.gapId}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${
                              gap.severity === 'CRITICAL'
                                ? 'bg-rose-950/60 text-rose-300 border-rose-800/70'
                                : 'bg-amber-950/60 text-amber-300 border-amber-800/70'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>
                              {gap.severity} Gap: <strong>{gap.missingSkillName}</strong>
                              {gap.adjacentVerifiedSkills[0]
                                ? ` (Bridgeable via ${gap.adjacentVerifiedSkills[0].skillName})`
                                : ''}
                            </span>
                          </span>
                        ))}

                        {job.specialInstructions.map((inst, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-indigo-950/60 text-indigo-300 border border-indigo-800/70"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              Special Instruction: {inst.exactRequirement}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Triage Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setRejectingJob(job)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-800 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleApprove(job.id)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve for Queue</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Job with Preference Memory Modal */}
      {rejectingJob && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                Reject Role: {rejectingJob.title} @ {rejectingJob.companyName}
              </h3>
              <button
                type="button"
                onClick={() => setRejectingJob(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Primary Rejection Reason
              </label>
              <div className="flex flex-wrap gap-2">
                {REJECTION_REASON_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setSelectedReason(chip)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                      selectedReason === chip
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Teach Copilot a rule for future jobs (Optional)
              </label>
              <textarea
                rows={3}
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="e.g., Skip roles focused on mobile React Native or requiring >25% customer travel"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-xs text-slate-200"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={learnRule}
                onChange={(e) => setLearnRule(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500"
              />
              <span>
                Store as a 768-dim <code className="text-emerald-400">JOB_REJECTION_PATTERN</code> rule in Preference Memory
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingJob(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmReject}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              >
                {isPending ? 'Saving...' : 'Confirm Reject & Learn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
