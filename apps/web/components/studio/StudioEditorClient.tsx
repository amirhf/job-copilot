'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertTriangle,
  Bot,
  ClipboardCopy,
  FileDown,
  Lock,
  RefreshCw,
} from 'lucide-react';
import type {
  TailoredResumePayload,
  AnsweredScreeningQuestion,
  PdfCompilationAudit,
} from '@job-copilot/db';
import type { JobWithEvaluationAndPackage } from '../../lib/data';
import {
  saveStudioEditAction,
  confirmApplicationSubmittedAction,
} from '../../actions/studio-actions';
import { CopyPasteApplyKitDrawer } from './CopyPasteApplyKitDrawer';

export function StudioEditorClient({
  job,
  candidate,
  availableExperiences,
}: {
  job: JobWithEvaluationAndPackage;
  candidate: {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    locationCity: string;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
  };
  availableExperiences: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    bullets: Array<{
      id: string;
      bulletText: string;
      quantifiedMetrics: Array<{ metric: string; value: string }>;
    }>;
  }>;
}) {
  const router = useRouter();
  const pkg = job.latestPackage;

  const [activeTab, setActiveTab] = useState<
    'resume-structured' | 'resume-typst' | 'cover-letter' | 'qa'
  >('resume-structured');
  const [layoutDensity, setLayoutDensity] = useState<
    'standard' | 'compact' | 'comfortable'
  >('standard');

  const [resumeData, setResumeData] = useState<TailoredResumePayload>(
    pkg?.tailoredResumeData ?? {
      targetHeadline: candidate.fullName,
      executiveSummary: '',
      selectedExperiences: [],
      selectedProjects: [],
      categorizedSkills: [],
    }
  );
  const [rawTypstSource, setRawTypstSource] = useState<string>(
    pkg?.resumeTypstSource ?? ''
  );
  const [coverLetterMarkdown, setCoverLetterMarkdown] = useState<string>(
    pkg?.coverLetterMarkdown ?? ''
  );
  const [qaAnswers, setQaAnswers] = useState<AnsweredScreeningQuestion[]>(
    pkg?.screeningQuestionAnswers ?? []
  );
  const [pdfAudit, setPdfAudit] = useState<PdfCompilationAudit | null>(
    pkg?.pdfAudit ?? null
  );

  // Preference Memory Phrasing Toggle State
  const [savePhrasingToMemory, setSavePhrasingToMemory] = useState<boolean>(false);
  const [lastOriginalSnippet, setLastOriginalSnippet] = useState<string>('');
  const [lastEditedSnippet, setLastEditedSnippet] = useState<string>('');
  const [lastEditScope, setLastEditScope] = useState<
    'RESUME_BULLETS' | 'COVER_LETTER' | 'SCREENING_QA'
  >('RESUME_BULLETS');

  // Assisted Apply Mode & Live Status
  const [applyModeChoice, setApplyModeChoice] = useState<
    'local-bridge' | 'browserbase' | 'copy-kit-only'
  >('local-bridge');
  const [showCopyKit, setShowCopyKit] = useState<boolean>(false);
  const [browserbaseLiveUrl, setBrowserbaseLiveUrl] = useState<string | null>(null);
  const [applyBannerMessage, setApplyBannerMessage] = useState<string | null>(null);
  const [pdfRefreshKey, setPdfRefreshKey] = useState<number>(1);
  const [isPending, startTransition] = useTransition();

  const isLocked = Boolean(pkg?.isImmutableSnapshot);

  function handleBulletChange(
    expIndex: number,
    bulletIndex: number,
    newText: string
  ) {
    setResumeData((prev) => {
      const next = structuredClone(prev);
      const targetBullet =
        next.selectedExperiences[expIndex]?.tailoredBullets[bulletIndex];
      if (targetBullet) {
        if (!lastOriginalSnippet) {
          setLastOriginalSnippet(targetBullet.tailoredText);
        }
        targetBullet.tailoredText = newText;
        setLastEditedSnippet(newText);
        setLastEditScope('RESUME_BULLETS');
      }
      return next;
    });
  }

  function handleSwapBulletFromGraph(
    expIndex: number,
    sourceBullet: { id: string; bulletText: string }
  ) {
    setResumeData((prev) => {
      const next = structuredClone(prev);
      const exp = next.selectedExperiences[expIndex];
      if (exp) {
        exp.tailoredBullets.push({
          sourceBulletId: sourceBullet.id,
          originalText: sourceBullet.bulletText,
          tailoredText: sourceBullet.bulletText,
        });
      }
      return next;
    });
  }

  function handleSaveAndRecompile() {
    if (!pkg || isLocked) return;
    startTransition(async () => {
      const res = await saveStudioEditAction({
        jobPostingId: job.id,
        packageId: pkg.id,
        tailoredResumeData: resumeData,
        rawResumeTypstOverride:
          activeTab === 'resume-typst' ? rawTypstSource : undefined,
        coverLetterMarkdown,
        screeningQuestionAnswers: qaAnswers,
        layoutDensity,
        phrasingMemoryLearning:
          savePhrasingToMemory && lastOriginalSnippet && lastEditedSnippet
            ? {
                saveToPreferenceMemory: true,
                originalTextSnippet: lastOriginalSnippet,
                userEditedTextSnippet: lastEditedSnippet,
                scope: lastEditScope,
              }
            : undefined,
      });

      setPdfAudit(res.pdfAudit);
      setRawTypstSource(res.resumeTypstSource);
      setPdfRefreshKey((k) => k + 1);
      if (res.learnedPreference) {
        setApplyBannerMessage(
          `Saved phrasing rule to Preference Memory: "${res.learnedPreference.ruleStatement}"`
        );
      } else {
        setApplyBannerMessage('Recompiled Vector PDF & verified Zero-Hallucination Audit.');
      }
    });
  }

  async function handleLaunchAssistedApply() {
    if (applyModeChoice === 'copy-kit-only') {
      setShowCopyKit(true);
      return;
    }

    setApplyBannerMessage('Starting Stagehand v4 Assisted Apply session...');
    try {
      const res = await fetch(`/api/applications/${job.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionMode: applyModeChoice }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        executionMode?: string;
        status?: string;
        liveViewUrl?: string;
        filledFieldsCount?: number;
        ambiguousFieldsFlagged?: string[];
        bridgeEndpoint?: string;
        applyPayload?: unknown;
      };

      if (data.status === 'CLIENT_BRIDGE_DISPATCH' && data.bridgeEndpoint) {
        try {
          const localRes = await fetch(data.bridgeEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.applyPayload),
          });
          if (localRes.ok) {
            setApplyBannerMessage(
              'Local Companion launched headed Chromium and halted at Submit for your visual inspection.'
            );
            return;
          }
        } catch {
          setShowCopyKit(true);
          setApplyBannerMessage(
            'Local companion daemon (127.0.0.1:43110) not running — opened Mode 2 Copy-Paste Kit Drawer.'
          );
          return;
        }
      }

      if (data.liveViewUrl) {
        setBrowserbaseLiveUrl(data.liveViewUrl);
      }
      setApplyBannerMessage(
        `Stagehand v4 (${data.executionMode}): Pre-filled ${data.filledFieldsCount ?? 0} fields & halted at Submit.`
      );
    } catch {
      setShowCopyKit(true);
    }
  }

  function handleConfirmSubmitted() {
    if (!pkg) return;
    startTransition(async () => {
      await confirmApplicationSubmittedAction({
        jobPostingId: job.id,
        packageId: pkg.id,
        applyMode:
          applyModeChoice === 'copy-kit-only'
            ? 'COPY_PASTE_KIT'
            : 'STAGEHAND_HEADED',
      });
      router.push('/applied');
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Studio Top Bar */}
      <div className="border-b border-slate-800 bg-slate-900/90 px-5 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/ready"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Ready Queue</span>
          </Link>
          <span className="text-slate-700">|</span>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">
              {job.title} @ {job.companyName}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Package v{pkg?.version ?? 1}</span>
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                  <Lock className="w-3 h-3" /> Immutable Applied Snapshot
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quality & Truthfulness Audit Bar */}
        {pdfAudit && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded-md border font-medium ${
                pdfAudit.overflowDetected
                  ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                  : 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
              }`}
            >
              Pages: {pdfAudit.pageCount}/{pdfAudit.targetMaxPages}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 border border-slate-700">
              ATS Keywords: {pdfAudit.atsKeywordCoveragePercent}%
            </span>
            <span
              className={`px-2.5 py-1 rounded-md border ${
                pdfAudit.zeroHallucinationAuditPassed
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                  : 'bg-rose-950/70 text-rose-300 border-rose-800'
              }`}
            >
              {pdfAudit.zeroHallucinationAuditPassed
                ? '100% Verified Metrics'
                : 'Unverified Metric Flagged'}
            </span>
          </div>
        )}

        {/* Action & Apply Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCopyKit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
            <span>1-Click Copy Kit</span>
          </button>

          <select
            value={applyModeChoice}
            onChange={(e) =>
              setApplyModeChoice(
                e.target.value as 'local-bridge' | 'browserbase' | 'copy-kit-only'
              )
            }
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="local-bridge">Apply Mode: Local Headed Bridge</option>
            <option value="browserbase">Apply Mode: Browserbase Cloud Live View</option>
            <option value="copy-kit-only">Apply Mode: Copy Kit Only</option>
          </select>

          <button
            type="button"
            disabled={isLocked}
            onClick={handleLaunchAssistedApply}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Launch Assisted Apply</span>
          </button>

          {!isLocked && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleConfirmSubmitted}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm Submitted</span>
            </button>
          )}
        </div>
      </div>

      {applyBannerMessage && (
        <div className="bg-indigo-950/70 border-b border-indigo-800 px-5 py-2 text-xs text-indigo-200 flex items-center justify-between">
          <span>{applyBannerMessage}</span>
          <button
            type="button"
            onClick={() => setApplyBannerMessage(null)}
            className="text-indigo-400 hover:text-indigo-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Split Screen Studio: Left Editor (50%) | Right Live PDF / Browserbase Preview (50%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Pane: Structured / Raw Typst / Cover Letter / Q&A Editor */}
        <div className="lg:col-span-6 border-r border-slate-800 flex flex-col overflow-hidden">
          <div className="px-5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'resume-structured', label: 'Resume (Structured)' },
                  { id: 'resume-typst', label: 'Raw Typst (.typ)' },
                  { id: 'cover-letter', label: 'Cover Letter' },
                  { id: 'qa', label: `Screening Q&A (${qaAnswers.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {!isLocked && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveAndRecompile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                {isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save & Recompile PDF</span>
              </button>
            )}
          </div>

          {/* Preference Memory Toggle Bar */}
          {!isLocked && (
            <div className="px-5 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savePhrasingToMemory}
                  onChange={(e) => setSavePhrasingToMemory(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                />
                <span>
                  Remember phrasing edits in <strong>Preference Memory</strong> (768-dim style rule)
                </span>
              </label>
            </div>
          )}

          {/* Editor Scroll Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeTab === 'resume-structured' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Target Headline
                  </label>
                  <input
                    type="text"
                    disabled={isLocked}
                    value={resumeData.targetHeadline}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        targetHeadline: e.target.value,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Executive Summary
                  </label>
                  <textarea
                    rows={3}
                    disabled={isLocked}
                    value={resumeData.executiveSummary}
                    onChange={(e) =>
                      setResumeData({
                        ...resumeData,
                        executiveSummary: e.target.value,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-100"
                  />
                </div>

                {resumeData.selectedExperiences.map((exp, expIdx) => {
                  const graphExp = availableExperiences.find(
                    (ge) => ge.id === exp.experienceId
                  );

                  return (
                    <div
                      key={exp.experienceId}
                      className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-100">
                            {exp.jobTitle} @ {exp.companyName}
                          </h4>
                          <span className="text-[11px] text-slate-400">
                            {exp.dateRangeText}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {exp.tailoredBullets.map((b, bIdx) => (
                          <div key={`${b.sourceBulletId}_${bIdx}`} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>
                                Citation: <code className="text-emerald-400">#{b.sourceBulletId.slice(0, 8)}</code>
                              </span>
                              <span className="text-slate-500 truncate max-w-xs">
                                Source: {b.originalText.slice(0, 55)}...
                              </span>
                            </div>
                            <textarea
                              rows={2}
                              disabled={isLocked}
                              value={b.tailoredText}
                              onChange={(e) =>
                                handleBulletChange(expIdx, bIdx, e.target.value)
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200"
                            />
                          </div>
                        ))}
                      </div>

                      {!isLocked && graphExp && graphExp.bullets.length > 0 && (
                        <div className="pt-1">
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const found = graphExp.bullets.find(
                                (gb) => gb.id === e.target.value
                              );
                              if (found) {
                                handleSwapBulletFromGraph(expIdx, found);
                                e.target.value = '';
                              }
                            }}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400"
                          >
                            <option value="" disabled>
                              + Add / Swap Verified Bullet from Master Career Graph...
                            </option>
                            {graphExp.bullets.map((gb) => (
                              <option key={gb.id} value={gb.id}>
                                {gb.bulletText.slice(0, 85)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'resume-typst' && (
              <div className="space-y-2 h-full flex flex-col">
                <label className="text-xs font-medium text-slate-400">
                  Raw Typst Source (<code className="text-emerald-400">resume-modern-ats.typ</code>)
                </label>
                <textarea
                  rows={24}
                  disabled={isLocked}
                  value={rawTypstSource}
                  onChange={(e) => setRawTypstSource(e.target.value)}
                  className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-slate-200"
                />
              </div>
            )}

            {activeTab === 'cover-letter' && (
              <div className="space-y-2 h-full flex flex-col">
                <label className="text-xs font-medium text-slate-300">
                  Tailored Cover Letter (Markdown)
                </label>
                <textarea
                  rows={20}
                  disabled={isLocked}
                  value={coverLetterMarkdown}
                  onChange={(e) => {
                    if (!lastOriginalSnippet) {
                      setLastOriginalSnippet(coverLetterMarkdown.slice(0, 200));
                    }
                    setCoverLetterMarkdown(e.target.value);
                    setLastEditedSnippet(e.target.value.slice(0, 200));
                    setLastEditScope('COVER_LETTER');
                  }}
                  className="w-full flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-100 leading-relaxed"
                />
              </div>
            )}

            {activeTab === 'qa' && (
              <div className="space-y-4">
                {qaAnswers.map((qa, idx) => (
                  <div
                    key={qa.questionId}
                    className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">
                        Q{idx + 1}: {qa.questionLabel}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Citations: {qa.citedCareerBlockIds.length} blocks
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      disabled={isLocked}
                      value={qa.userEditedAnswer ?? qa.draftedAnswer}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQaAnswers((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, userEditedAnswer: val }
                              : item
                          )
                        );
                        setLastOriginalSnippet(qa.draftedAnswer);
                        setLastEditedSnippet(val);
                        setLastEditScope('SCREENING_QA');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Live Vector PDF Preview or Browserbase Cloud Live View */}
        <div className="lg:col-span-6 p-5 bg-slate-900/30 flex flex-col space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {browserbaseLiveUrl
                  ? 'Browserbase Interactive Live View (Halted at Submit)'
                  : 'Compiled Vector PDF Preview'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={layoutDensity}
                onChange={(e) =>
                  setLayoutDensity(
                    e.target.value as 'standard' | 'compact' | 'comfortable'
                  )
                }
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
              >
                <option value="standard">Density: Standard (9.8pt)</option>
                <option value="compact">Density: Compact (9.0pt Auto-Fit)</option>
                <option value="comfortable">Density: Comfortable (10.2pt)</option>
              </select>

              <a
                href={`/api/applications/${job.id}/pdf?type=resume`}
                download
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Resume PDF</span>
              </a>

              <a
                href={`/api/applications/${job.id}/pdf?type=cover-letter`}
                download
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Cover Letter PDF</span>
              </a>
            </div>
          </div>

          {browserbaseLiveUrl ? (
            <iframe
              title="Browserbase Assisted Apply Live View"
              src={browserbaseLiveUrl}
              className="w-full flex-1 rounded-xl border border-indigo-700 bg-slate-950"
            />
          ) : (
            <iframe
              key={pdfRefreshKey}
              title="Live Compiled PDF Preview"
              src={`/api/applications/${job.id}/pdf?type=${
                activeTab === 'cover-letter' ? 'cover-letter' : 'resume'
              }&v=${pdfRefreshKey}`}
              className="w-full flex-1 rounded-xl border border-slate-800 bg-white"
            />
          )}
        </div>
      </div>

      {showCopyKit && (
        <CopyPasteApplyKitDrawer
          jobId={job.id}
          companyName={job.companyName}
          jobTitle={job.title}
          applicationUrl={job.applicationUrl}
          candidate={candidate}
          screeningAnswers={qaAnswers}
          onClose={() => setShowCopyKit(false)}
        />
      )}
    </div>
  );
}
