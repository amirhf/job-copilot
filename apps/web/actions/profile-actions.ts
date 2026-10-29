'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  db,
  eq,
  candidateProfile,
  preferenceMemory,
  type HardFiltersConfig,
  type RubricWeightsConfig,
} from '@job-copilot/db';
import {
  ingestAndMergeCareerDocument,
  addSkillEvidenceFromGapResolution,
} from '@job-copilot/agents';
import { getOrEnsureCandidateProfile } from '../lib/data';

const RubricWeightsValidator = z
  .object({
    techStackAlignment: z.number().min(0).max(1),
    seniorityAndScope: z.number().min(0).max(1),
    domainIndustryFit: z.number().min(0).max(1),
    companyStageCulture: z.number().min(0).max(1),
  })
  .refine(
    (w) =>
      Math.abs(
        w.techStackAlignment +
          w.seniorityAndScope +
          w.domainIndustryFit +
          w.companyStageCulture -
          1.0
      ) < 0.01,
    { message: 'Rubric weights must sum to 1.0' }
  );

export async function ingestCareerDocumentAction(params: {
  sourceType:
    | 'RESUME_UPLOAD'
    | 'PROJECT_DOC'
    | 'PORTFOLIO_URL'
    | 'GITHUB_REPO'
    | 'GAP_RESOLUTION_PROMPT'
    | 'MANUAL_UI_ENTRY';
  title: string;
  rawTextOrMarkdown: string;
  sourceUrl?: string;
}) {
  const profile = await getOrEnsureCandidateProfile();

  const mergeResult = await ingestAndMergeCareerDocument({
    profileId: profile.id,
    title: params.title,
    sourceType: params.sourceType,
    sourceUrlOrPath: params.sourceUrl,
    rawMarkdownContent: params.rawTextOrMarkdown,
  });

  revalidatePath('/profile');
  return {
    ok: true,
    mergeResult,
  };
}

export async function linkUnverifiedSkillAction(params: {
  skillName: string;
  experienceId: string;
  proficiency: 'EXPERT' | 'PROFICIENT' | 'FAMILIAR';
  newBulletText: string;
}) {
  const profile = await getOrEnsureCandidateProfile();

  const res = await addSkillEvidenceFromGapResolution({
    profileId: profile.id,
    skillName: params.skillName,
    proficiency: params.proficiency,
    experienceId: params.experienceId,
    newBulletText: params.newBulletText,
  });

  revalidatePath('/profile');
  return {
    ok: true,
    ...res,
  };
}

export async function updateHardFiltersAction(hardFilters: HardFiltersConfig) {
  const profile = await getOrEnsureCandidateProfile();

  await db
    .update(candidateProfile)
    .set({
      hardFilters,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfile.id, profile.id));

  revalidatePath('/profile');
  revalidatePath('/inbox');
  return { ok: true, hardFilters };
}

export async function updateRubricWeightsAction(rubricWeights: RubricWeightsConfig) {
  const validated = RubricWeightsValidator.parse(rubricWeights);
  const profile = await getOrEnsureCandidateProfile();

  await db
    .update(candidateProfile)
    .set({
      rubricWeights: validated,
      updatedAt: new Date(),
    })
    .where(eq(candidateProfile.id, profile.id));

  revalidatePath('/profile');
  revalidatePath('/inbox');
  return { ok: true, rubricWeights: validated };
}

export async function togglePreferenceRuleAction(params: {
  memoryId: string;
  isActive: boolean;
}) {
  await db
    .update(preferenceMemory)
    .set({ isActive: params.isActive })
    .where(eq(preferenceMemory.id, params.memoryId));

  revalidatePath('/profile');
  return { ok: true };
}

export async function deletePreferenceRuleAction(memoryId: string) {
  await db
    .delete(preferenceMemory)
    .where(eq(preferenceMemory.id, memoryId));

  revalidatePath('/profile');
  return { ok: true };
}
