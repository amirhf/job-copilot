import { z } from 'zod';
import {
  db,
  eq,
  and,
  preferenceMemory,
  type Database,
} from '@job-copilot/db';
import {
  generateStructuredWithTier,
  generateSingleEmbedding,
} from '../routers/model-router';

export const DistilledWritingRuleSchema = z.object({
  preferenceType: z.enum(['PHRASING_REPLACEMENT', 'TONE_AND_STYLE_RULE']),
  ruleStatement: z
    .string()
    .describe(
      'Clear, actionable instruction for future synthesis, e.g. "Never use the verb spearheaded; use architected, built, or led instead."'
    ),
  applicableScopes: z.array(
    z.enum(['RESUME_BULLETS', 'COVER_LETTER', 'SCREENING_QA'])
  ),
});

export type DistilledWritingRule = z.infer<typeof DistilledWritingRuleSchema>;

export const DistilledRejectionRuleSchema = z.object({
  ruleStatement: z
    .string()
    .describe(
      'Concise rubric scoring rule learned from a job rejection, e.g. "Penalize roles requiring >25% travel or heavy mobile React Native maintenance."'
    ),
});

export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function recordJobRejectionMemory(params: {
  profileId: string;
  jobPostingId: string;
  companyName: string;
  jobTitle: string;
  rejectionReasonCategory: string;
  userFeedbackNote?: string;
  existingRules?: Array<{
    id: string;
    ruleStatement: string;
    confidenceWeight: number;
    embedding: number[] | null;
  }>;
  database?: Database;
}): Promise<{
  action: 'INSERTED' | 'REINFORCED';
  memoryId: string;
  ruleStatement: string;
  confidenceWeight: number;
}> {
  const activeDb = params.database ?? db;
  const hasLlmKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY
  );

  let ruleStatement = params.userFeedbackNote?.trim()
    ? `Penalize roles matching user rejection note (${params.rejectionReasonCategory}): ${params.userFeedbackNote.trim()}`
    : `Penalize roles similar to rejected ${params.jobTitle} at ${params.companyName} due to ${params.rejectionReasonCategory}.`;

  if (hasLlmKey && params.userFeedbackNote?.trim()) {
    try {
      const { object } = await generateStructuredWithTier({
        tier: 'TIER_1_INGESTION',
        schema: DistilledRejectionRuleSchema,
        systemPrompt:
          'You distill a candidate job rejection reason into a single concise, reusable rubric scoring rule statement.',
        userPrompt: `Rejected Role: ${params.jobTitle} @ ${params.companyName}\nCategory: ${params.rejectionReasonCategory}\nCandidate Note: ${params.userFeedbackNote}`,
      });
      ruleStatement = object.ruleStatement;
    } catch {
      // Keep deterministic fallback ruleStatement
    }
  }

  const embedding = await generateSingleEmbedding(ruleStatement);

  const existing =
    params.existingRules ??
    (await activeDb.query.preferenceMemory.findMany({
      where: and(
        eq(preferenceMemory.profileId, params.profileId),
        eq(preferenceMemory.preferenceType, 'JOB_REJECTION_PATTERN')
      ),
    }));

  // Check for existing rule with cosine similarity > 0.88
  for (const rule of existing) {
    if (rule.embedding && computeCosineSimilarity(embedding, rule.embedding) > 0.88) {
      const updatedWeight = Math.min(1.0, (rule.confidenceWeight ?? 1.0) + 0.15);
      if (params.database || !params.existingRules) {
        await activeDb
          .update(preferenceMemory)
          .set({ confidenceWeight: updatedWeight })
          .where(eq(preferenceMemory.id, rule.id));
      }
      return {
        action: 'REINFORCED',
        memoryId: rule.id,
        ruleStatement: rule.ruleStatement,
        confidenceWeight: updatedWeight,
      };
    }
  }

  if (params.existingRules && !params.database) {
    return {
      action: 'INSERTED',
      memoryId: 'mem_in_memory',
      ruleStatement,
      confidenceWeight: 1.0,
    };
  }

  const [inserted] = await activeDb
    .insert(preferenceMemory)
    .values({
      profileId: params.profileId,
      sourceJobPostingId: params.jobPostingId,
      preferenceType: 'JOB_REJECTION_PATTERN',
      ruleStatement,
      applicableScopes: ['RUBRIC_SCORING'],
      confidenceWeight: 1.0,
      isActive: true,
      embedding,
    })
    .returning({ id: preferenceMemory.id });

  return {
    action: 'INSERTED',
    memoryId: inserted!.id,
    ruleStatement,
    confidenceWeight: 1.0,
  };
}

export async function recordStudioPhrasingMemory(params: {
  profileId: string;
  jobPostingId?: string;
  originalTextSnippet: string;
  userEditedTextSnippet: string;
  defaultScope?: 'RESUME_BULLETS' | 'COVER_LETTER' | 'SCREENING_QA';
  existingRules?: Array<{
    id: string;
    ruleStatement: string;
    confidenceWeight: number;
    embedding: number[] | null;
  }>;
  database?: Database;
}): Promise<{
  action: 'INSERTED' | 'REINFORCED';
  memoryId: string;
  preferenceType: 'PHRASING_REPLACEMENT' | 'TONE_AND_STYLE_RULE';
  ruleStatement: string;
  applicableScopes: Array<'RESUME_BULLETS' | 'COVER_LETTER' | 'SCREENING_QA'>;
  confidenceWeight: number;
}> {
  const activeDb = params.database ?? db;
  const defaultScope = params.defaultScope ?? 'RESUME_BULLETS';
  const hasLlmKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY
  );

  let distilled: DistilledWritingRule = {
    preferenceType: 'PHRASING_REPLACEMENT',
    ruleStatement: `Prefer phrasing style "${params.userEditedTextSnippet.slice(0, 120)}" over "${params.originalTextSnippet.slice(0, 120)}".`,
    applicableScopes: [defaultScope],
  };

  if (hasLlmKey) {
    try {
      const { object } = await generateStructuredWithTier({
        tier: 'TIER_1_INGESTION',
        schema: DistilledWritingRuleSchema,
        systemPrompt:
          'Compare the original AI-generated text with the user-edited text and extract a concise, reusable writing style or phrasing rule.',
        userPrompt: `ORIGINAL:\n${params.originalTextSnippet}\n\nUSER EDITED:\n${params.userEditedTextSnippet}\n\nDefault Scope: ${defaultScope}`,
      });
      distilled = object;
    } catch {
      // Keep deterministic distilled rule
    }
  }

  const embedding = await generateSingleEmbedding(distilled.ruleStatement);

  const existing =
    params.existingRules ??
    (await activeDb.query.preferenceMemory.findMany({
      where: eq(preferenceMemory.profileId, params.profileId),
    }));

  for (const rule of existing) {
    if (rule.embedding && computeCosineSimilarity(embedding, rule.embedding) > 0.88) {
      const updatedWeight = Math.min(1.0, (rule.confidenceWeight ?? 1.0) + 0.15);
      if (params.database || !params.existingRules) {
        await activeDb
          .update(preferenceMemory)
          .set({ confidenceWeight: updatedWeight })
          .where(eq(preferenceMemory.id, rule.id));
      }
      return {
        action: 'REINFORCED',
        memoryId: rule.id,
        preferenceType: distilled.preferenceType,
        ruleStatement: rule.ruleStatement,
        applicableScopes: distilled.applicableScopes,
        confidenceWeight: updatedWeight,
      };
    }
  }

  if (params.existingRules && !params.database) {
    return {
      action: 'INSERTED',
      memoryId: 'mem_phrasing_in_memory',
      preferenceType: distilled.preferenceType,
      ruleStatement: distilled.ruleStatement,
      applicableScopes: distilled.applicableScopes,
      confidenceWeight: 1.0,
    };
  }

  const [inserted] = await activeDb
    .insert(preferenceMemory)
    .values({
      profileId: params.profileId,
      sourceJobPostingId: params.jobPostingId ?? null,
      preferenceType: distilled.preferenceType,
      ruleStatement: distilled.ruleStatement,
      originalTextSnippet: params.originalTextSnippet,
      userEditedTextSnippet: params.userEditedTextSnippet,
      applicableScopes: distilled.applicableScopes,
      confidenceWeight: 1.0,
      isActive: true,
      embedding,
    })
    .returning({ id: preferenceMemory.id });

  return {
    action: 'INSERTED',
    memoryId: inserted!.id,
    preferenceType: distilled.preferenceType,
    ruleStatement: distilled.ruleStatement,
    applicableScopes: distilled.applicableScopes,
    confidenceWeight: 1.0,
  };
}
