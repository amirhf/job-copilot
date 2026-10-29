'use client';

import React, { useState } from 'react';
import { AlertTriangle, PlusCircle, GitBranch, EyeOff } from 'lucide-react';
import type { FlaggedSkillGap } from '@job-copilot/db';

export interface GapResolutionCardProps {
  jobPostingId: string;
  gap: FlaggedSkillGap;
  availableExperiences: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
  }>;
  onResolved: () => void;
}

export function GapResolutionCard({
  jobPostingId,
  gap,
  availableExperiences,
  onResolved,
}: GapResolutionCardProps) {
  const [mode, setMode] = useState<'ADDED_TO_PROFILE' | 'BRIDGED' | 'IGNORED'>(
    availableExperiences.length > 0 ? 'ADDED_TO_PROFILE' : 'BRIDGED'
  );
  const [selectedExpId, setSelectedExpId] = useState<string>(
    availableExperiences[0]?.id ?? ''
  );
  const [proficiency, setProficiency] = useState<'EXPERT' | 'PROFICIENT' | 'FAMILIAR'>(
    'PROFICIENT'
  );
  const [newBulletText, setNewBulletText] = useState<string>('');
  const [selectedBridgeSkill, setSelectedBridgeSkill] = useState<string>(
    gap.adjacentVerifiedSkills[0]?.skillName ?? ''
  );
  const [guidanceNote, setGuidanceNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const resolutionPayload = {
        gapId: gap.gapId,
        action: mode,
        bridgeSkillName: mode === 'BRIDGED' ? selectedBridgeSkill : undefined,
        userGuidanceNote: guidanceNote || undefined,
        newProfileEvidence:
          mode === 'ADDED_TO_PROFILE' && selectedExpId && newBulletText.trim()
            ? {
                experienceId: selectedExpId,
                skillName: gap.missingSkillName,
                proficiency,
                newBulletText: newBulletText.trim(),
              }
            : undefined,
      };

      const res = await fetch(`/api/applications/${jobPostingId}/resolve-gap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolutions: [resolutionPayload],
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Failed to resolve gap');
        return;
      }

      onResolved();
    } catch {
      setError('Network error while resolving gap');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-4 space-y-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
            {gap.severity} Skill Gap Suspended Pipeline: {gap.missingSkillName}
          </div>
          <p className="text-xs text-slate-300">{gap.requirementText}</p>
        </div>
      </div>

      {/* 3 Resolution Path Tabs */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setMode('ADDED_TO_PROFILE')}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            mode === 'ADDED_TO_PROFILE'
              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
              : 'bg-slate-900 text-slate-400 border-slate-800'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Add Evidence to Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('BRIDGED')}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            mode === 'BRIDGED'
              ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
              : 'bg-slate-900 text-slate-400 border-slate-800'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Bridge Adjacent Skill</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('IGNORED')}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            mode === 'IGNORED'
              ? 'bg-slate-800 text-slate-200 border-slate-600'
              : 'bg-slate-900 text-slate-400 border-slate-800'
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>Ignore Requirement</span>
        </button>
      </div>

      {mode === 'ADDED_TO_PROFILE' && (
        <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Linked Experience
              </label>
              <select
                value={selectedExpId}
                onChange={(e) => setSelectedExpId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              >
                {availableExperiences.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.jobTitle} @ {exp.companyName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Proficiency Level
              </label>
              <select
                value={proficiency}
                onChange={(e) =>
                  setProficiency(
                    e.target.value as 'EXPERT' | 'PROFICIENT' | 'FAMILIAR'
                  )
                }
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="EXPERT">EXPERT</option>
                <option value="PROFICIENT">PROFICIENT</option>
                <option value="FAMILIAR">FAMILIAR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              1-Sentence Verified Achievement Bullet (Added to Master Career Graph)
            </label>
            <textarea
              rows={2}
              value={newBulletText}
              onChange={(e) => setNewBulletText(e.target.value)}
              placeholder={`e.g., Built and operated ${gap.missingSkillName} services in production supporting 50k RPS.`}
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200"
            />
          </div>
        </div>
      )}

      {mode === 'BRIDGED' && (
        <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-lg p-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Adjacent Verified Skill to Bridge From
            </label>
            <input
              type="text"
              value={selectedBridgeSkill}
              onChange={(e) => setSelectedBridgeSkill(e.target.value)}
              placeholder="e.g., AWS ECS / Docker / TypeScript"
              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Optional Framing Note
            </label>
            <input
              type="text"
              value={guidanceNote}
              onChange={(e) => setGuidanceNote(e.target.value)}
              placeholder="Emphasize transferable distributed systems architecture"
              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={
            submitting ||
            (mode === 'ADDED_TO_PROFILE' && (!selectedExpId || !newBulletText.trim()))
          }
          onClick={handleSubmit}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
        >
          {submitting
            ? 'Saving & Resuming Synthesis...'
            : 'Confirm Resolution & Resume Generation'}
        </button>
      </div>
    </div>
  );
}
