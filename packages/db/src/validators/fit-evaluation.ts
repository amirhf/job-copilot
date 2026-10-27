import { z } from 'zod';

export const CategoryScoreDetailSchema = z.object({
  score: z.number().int().min(0).max(100),
  rationale: z
    .string()
    .describe(
      'Concise evidence-backed justification citing specific Career Block IDs or missing requirements'
    ),
});

export const Stage2RubricOutputSchema = z.object({
  categoryScores: z.object({
    techStackAlignment: CategoryScoreDetailSchema,
    seniorityAndScope: CategoryScoreDetailSchema,
    domainIndustryFit: CategoryScoreDetailSchema,
    companyStageCulture: CategoryScoreDetailSchema,
  }),
  preferencePenaltyPoints: z
    .number()
    .int()
    .min(-30)
    .max(15)
    .default(0)
    .describe(
      'Score adjustment (-30 to +15) based on learned preference_memory rules (e.g. negative penalty if role matches past user rejection patterns)'
    ),
  executiveSummary: z
    .string()
    .describe(
      '3-4 crisp Markdown bullet points highlighting the strongest fit signals and any notable trade-offs for Surface A Triage Inbox'
    ),
  topMatchedBlockIds: z.object({
    experienceIds: z.array(z.string()),
    bulletIds: z.array(z.string()),
    projectIds: z.array(z.string()),
    skillIds: z.array(z.string()),
  }),
  flaggedGaps: z.array(
    z.object({
      gapId: z.string().describe('Deterministic slug, e.g. "gap-kubernetes-production"'),
      requirementText: z.string().describe('Verbatim requirement from the job posting'),
      missingSkillName: z
        .string()
        .describe('Specific skill, domain, or credential absent from the Master Career Graph'),
      severity: z.enum(['CRITICAL', 'MODERATE', 'MINOR']),
      adjacentVerifiedSkills: z.array(
        z.object({
          skillId: z.string().describe('ID of a verified skill in career_skills'),
          skillName: z.string(),
          rationale: z
            .string()
            .describe('How this verified skill transfers or bridges the missing requirement'),
        })
      ),
    })
  ),
});

export type Stage2RubricOutput = z.infer<typeof Stage2RubricOutputSchema>;
