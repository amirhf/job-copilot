'use client';

import React, { useState, useTransition } from 'react';
import {
  Upload,
  CheckCircle2,
  Sliders,
  Brain,
  Trash2,
  Briefcase,
} from 'lucide-react';
import type { HardFiltersConfig, RubricWeightsConfig } from '@job-copilot/db';
import {
  ingestCareerDocumentAction,
  linkUnverifiedSkillAction,
  updateHardFiltersAction,
  updateRubricWeightsAction,
  togglePreferenceRuleAction,
  deletePreferenceRuleAction,
} from '../../actions/profile-actions';

export function ProfileBuilderClient({
  profile,
  experiences,
  projects,
  skills,
  preferences,
}: {
  profile: {
    id: string;
    fullName: string;
    headline: string;
    hardFilters: HardFiltersConfig;
    rubricWeights: RubricWeightsConfig;
  };
  experiences: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    startDate: string;
    endDate: string | null;
    bullets: Array<{ id: string; bulletText: string }>;
  }>;
  projects: Array<{
    id: string;
    projectName: string;
    tagline: string;
    techStackTags: string[];
  }>;
  skills: Array<{
    id: string;
    name: string;
    category: string;
    proficiency: string;
    isUserVerified: boolean;
    evidenceLinks: Array<{ id: string }>;
  }>;
  preferences: Array<{
    id: string;
    preferenceType: string;
    ruleStatement: string;
    confidenceWeight: number;
    isActive: boolean;
  }>;
}) {
  const [activeTab, setActiveTab] = useState<
    'graph' | 'skills' | 'filters-rubric' | 'memory'
  >('graph');

  // Document Ingestion Form State
  const [docTitle, setDocTitle] = useState<string>('');
  const [docType, setDocType] = useState<
    'RESUME_UPLOAD' | 'PROJECT_DOC' | 'GITHUB_REPO' | 'MANUAL_UI_ENTRY'
  >('RESUME_UPLOAD');
  const [docRawText, setDocRawText] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Skill Linker State
  const [newSkillName, setNewSkillName] = useState<string>('');
  const [selectedExpId, setSelectedExpId] = useState<string>(
    experiences[0]?.id ?? ''
  );
  const [newSkillBullet, setNewSkillBullet] = useState<string>('');

  // Hard Filters & Rubric Weights State
  const [minSalary, setMinSalary] = useState<number>(
    profile.hardFilters.minBaseSalaryUsd ?? 185000
  );
  const [weights, setWeights] = useState<RubricWeightsConfig>(
    profile.rubricWeights
  );

  const [isPending, startTransition] = useTransition();

  function handleIngestDocument() {
    if (!docTitle.trim() || !docRawText.trim()) return;
    startTransition(async () => {
      const res = await ingestCareerDocumentAction({
        sourceType: docType,
        title: docTitle.trim(),
        rawTextOrMarkdown: docRawText,
      });
      setStatusBanner(
        `Merged into Master Career Graph: +${res.mergeResult.experiencesCreated} roles, +${res.mergeResult.bulletsCreated} bullets, +${res.mergeResult.verifiedSkillsUpserted} verified skills.`
      );
      setDocTitle('');
      setDocRawText('');
    });
  }

  function handleLinkSkill() {
    if (!newSkillName.trim() || !selectedExpId || !newSkillBullet.trim()) return;
    startTransition(async () => {
      await linkUnverifiedSkillAction({
        skillName: newSkillName.trim(),
        experienceId: selectedExpId,
        proficiency: 'PROFICIENT',
        newBulletText: newSkillBullet.trim(),
      });
      setNewSkillName('');
      setNewSkillBullet('');
      setStatusBanner('Verified skill & achievement bullet linked to Master Career Graph.');
    });
  }

  function handleSaveFiltersAndWeights() {
    startTransition(async () => {
      await updateHardFiltersAction({
        ...profile.hardFilters,
        minBaseSalaryUsd: minSalary,
      });
      await updateRubricWeightsAction(weights);
      setStatusBanner('Saved Stage 1 Hard Filters and Stage 2 Rubric Weights.');
    });
  }

  const weightSum = Number(
    (
      weights.techStackAlignment +
      weights.seniorityAndScope +
      weights.domainIndustryFit +
      weights.companyStageCulture
    ).toFixed(2)
  );

  const unverifiedSkills = skills.filter((s) => !s.isUserVerified);

  return (
    <div className="space-y-5">
      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {(
          [
            { id: 'graph', label: 'Master Career Graph & Ingestion', icon: Briefcase },
            { id: 'skills', label: `Verified Skills (${skills.length})`, icon: CheckCircle2 },
            { id: 'filters-rubric', label: 'Hard Filters & Rubric Sliders', icon: Sliders },
            { id: 'memory', label: `Learned Preferences (${preferences.length})`, icon: Brain },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-emerald-400 border-slate-700'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {statusBanner && (
        <div className="bg-emerald-950/60 border border-emerald-800 rounded-xl px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'graph' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Multi-Source Document Ingestion */}
          <div className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Ingest Career Document into Graph</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Source Type
                </label>
                <select
                  value={docType}
                  onChange={(e) =>
                    setDocType(
                      e.target.value as
                        | 'RESUME_UPLOAD'
                        | 'PROJECT_DOC'
                        | 'GITHUB_REPO'
                        | 'MANUAL_UI_ENTRY'
                    )
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="RESUME_UPLOAD">Resume (Markdown / Text)</option>
                  <option value="PROJECT_DOC">Project Architecture Doc</option>
                  <option value="GITHUB_REPO">GitHub Repo README</option>
                  <option value="MANUAL_UI_ENTRY">Manual Experience Note</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g., Alex Rivera 2026 Resume"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Raw Resume / Architecture Markdown Content
              </label>
              <textarea
                rows={8}
                value={docRawText}
                onChange={(e) => setDocRawText(e.target.value)}
                placeholder="Paste resume markdown, project deep-dive, or STAR stories..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200"
              />
            </div>

            <button
              type="button"
              disabled={isPending || !docTitle.trim() || !docRawText.trim()}
              onClick={handleIngestDocument}
              className="w-full py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
            >
              {isPending
                ? 'Extracting & Embedding (768-dim)...'
                : 'Extract & Merge into Master Career Graph'}
            </button>
          </div>

          {/* Right: Existing Career Graph Tree */}
          <div className="lg:col-span-7 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Verified Experiences ({experiences.length}) & Projects ({projects.length})
            </h3>
            {experiences.map((exp) => (
              <div
                key={exp.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-100">
                    {exp.jobTitle} @ {exp.companyName}
                  </span>
                  <span className="text-xs text-slate-400">
                    {exp.startDate} &ndash; {exp.endDate ?? 'Present'}
                  </span>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc text-xs text-slate-300">
                  {exp.bullets.map((b) => (
                    <li key={b.id}>{b.bulletText}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Link Skill Evidence to Master Career Graph (Zero-Hallucination Invariant)
            </h3>
            {unverifiedSkills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {unverifiedSkills.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setNewSkillName(u.name)}
                    className="px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800 text-xs"
                  >
                    Unverified Mention: {u.name} (Click to Link)
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="Skill Name (e.g., Kubernetes)"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
              <select
                value={selectedExpId}
                onChange={(e) => setSelectedExpId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                {experiences.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.jobTitle} @ {exp.companyName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newSkillBullet}
                onChange={(e) => setNewSkillBullet(e.target.value)}
                placeholder="1-sentence achievement bullet proving skill..."
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              />
            </div>

            <button
              type="button"
              disabled={isPending || !newSkillName.trim() || !newSkillBullet.trim()}
              onClick={handleLinkSkill}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
            >
              Link Verified Skill & Create Evidence Edge
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {skills.map((sk) => (
              <div
                key={sk.id}
                className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-100">{sk.name}</div>
                  <div className="text-[10px] text-slate-400">{sk.proficiency}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[10px]">
                  {sk.evidenceLinks.length} Evidence
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'filters-rubric' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Stage 1 Deterministic Hard Filters
            </h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Minimum Base Salary Floor (USD)
              </label>
              <input
                type="number"
                value={minSalary}
                onChange={(e) => setMinSalary(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Stage 2 Rubric Weights (Sum: {Math.round(weightSum * 100)}%)
              </h3>
            </div>

            {(
              [
                { key: 'techStackAlignment', label: 'Tech Stack Alignment' },
                { key: 'seniorityAndScope', label: 'Seniority & Scope' },
                { key: 'domainIndustryFit', label: 'Domain / Industry Fit' },
                { key: 'companyStageCulture', label: 'Company Stage & Culture' },
              ] as const
            ).map((item) => (
              <div key={item.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-emerald-400 font-medium">
                    {Math.round(weights[item.key] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.7}
                  step={0.05}
                  value={weights[item.key]}
                  onChange={(e) =>
                    setWeights({
                      ...weights,
                      [item.key]: Number(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>
            ))}

            <button
              type="button"
              disabled={isPending || Math.abs(weightSum - 1.0) > 0.01}
              onClick={handleSaveFiltersAndWeights}
              className="w-full py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
            >
              {Math.abs(weightSum - 1.0) > 0.01
                ? 'Weights Must Sum to 100%'
                : 'Save Filters & Rubric Configuration'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'memory' && (
        <div className="space-y-3">
          {preferences.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400">
              No learned preference rules yet. Reject a job with a note or check &ldquo;Remember phrasing edits&rdquo; in the Studio to teach Copilot.
            </div>
          ) : (
            preferences.map((pref) => (
              <div
                key={pref.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800 text-[10px] font-semibold">
                      {pref.preferenceType}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Confidence: {Math.round(pref.confidenceWeight * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-200">{pref.ruleStatement}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await togglePreferenceRuleAction({
                          memoryId: pref.id,
                          isActive: !pref.isActive,
                        });
                      })
                    }
                    className={`px-2.5 py-1 rounded text-xs border cursor-pointer ${
                      pref.isActive
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {pref.isActive ? 'Active' : 'Muted'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deletePreferenceRuleAction(pref.id);
                      })
                    }
                    className="p-1.5 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
