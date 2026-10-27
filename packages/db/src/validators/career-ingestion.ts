import { z } from 'zod';

export const ExtractedQuantifiedMetricSchema = z.object({
  metric: z
    .string()
    .describe('What was measured, e.g. "API p99 latency", "infrastructure cost", "test coverage"'),
  value: z
    .string()
    .describe('Exact figure stated in the source text, e.g. "45%", "$240K/yr", "10x"'),
  context: z.string().optional().describe('Baseline or scope context if explicitly stated'),
  isExactFromSource: z
    .literal(true)
    .describe('Must always be true; never estimate or invent numbers not in the text'),
});

export const ExtractedAtomicBulletSchema = z.object({
  tempBulletId: z
    .string()
    .describe('Deterministic local ID within this extraction, e.g. "exp_1_bullet_1"'),
  bulletText: z
    .string()
    .describe('Self-contained, single-claim achievement statement preserving all original facts'),
  actionVerb: z.string().describe('Strong past-tense or present-tense action verb opening the bullet'),
  situationAndTask: z.string().optional().describe('Underlying problem or business context if stated'),
  technicalApproach: z.string().optional().describe('Specific tools, architectures, or methods used'),
  quantifiedMetrics: z.array(ExtractedQuantifiedMetricSchema).default([]),
  skillTags: z
    .array(z.string())
    .describe('Canonical technical and domain skills explicitly demonstrated in this bullet'),
  impactScore: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe(
      'Estimated strength of the bullet (80-100 for quantified high-scope outcomes, 40-79 for standard execution)'
    ),
});

export const ExtractedExperienceSchema = z.object({
  tempExperienceId: z.string().describe('Local ID, e.g. "exp_1"'),
  companyName: z.string(),
  normalizedCompanyName: z
    .string()
    .describe('Lowercase trimmed company identifier without legal suffixes like Inc/LLC'),
  jobTitle: z.string(),
  employmentType: z
    .enum(['FULL_TIME', 'CONTRACT', 'FOUNDER', 'INTERNSHIP', 'ADVISORY'])
    .default('FULL_TIME'),
  location: z.string().optional(),
  remotePolicy: z
    .enum([
      'REMOTE_GLOBAL',
      'REMOTE_COUNTRY_LOCKED',
      'REMOTE_TIMEZONE_LOCKED',
      'HYBRID',
      'ONSITE',
      'UNKNOWN',
    ])
    .default('UNKNOWN'),
  startDate: z.string().describe('ISO date YYYY-MM-01'),
  endDate: z.string().nullable().describe('ISO date YYYY-MM-01 or null if current role'),
  isCurrent: z.boolean(),
  companyStageAndContext: z.string().optional(),
  roleOverview: z.string().describe('1-2 sentence summary of role scope and responsibilities'),
  domainTags: z.array(z.string()),
  primaryTechStack: z.array(z.string()),
  bullets: z.array(ExtractedAtomicBulletSchema),
});

export const ExtractedProjectSchema = z.object({
  tempProjectId: z.string().describe('Local ID, e.g. "proj_1"'),
  projectName: z.string(),
  tagline: z.string(),
  problemStatement: z.string(),
  architectureAndStack: z.string(),
  quantifiedOutcomes: z.array(ExtractedQuantifiedMetricSchema).default([]),
  highlightBullets: z.array(z.string()),
  techStackTags: z.array(z.string()),
  repositoryUrl: z.string().url().optional().or(z.literal('')),
  liveDemoUrl: z.string().url().optional().or(z.literal('')),
});

export const ExtractedStarStorySchema = z.object({
  tempStoryId: z.string().describe('Local ID, e.g. "story_1"'),
  linkedTempExperienceId: z.string().optional(),
  linkedTempProjectId: z.string().optional(),
  title: z.string(),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
  quantifiedMetrics: z.array(ExtractedQuantifiedMetricSchema).default([]),
  themes: z
    .array(z.string())
    .describe(
      'Behavioral themes such as "system_design", "leadership", "debugging", "cross_functional_alignment"'
    ),
});

export const ExtractedSkillWithEvidenceSchema = z.object({
  name: z
    .string()
    .describe('Display name of the skill, e.g. "TypeScript", "PostgreSQL", "Distributed Systems"'),
  normalizedSlug: z
    .string()
    .describe('Lowercase hyphenated slug, e.g. "typescript", "postgresql", "distributed-systems"'),
  aliases: z.array(z.string()).default([]),
  category: z.enum([
    'LANGUAGE',
    'FRAMEWORK_LIBRARY',
    'DATABASE_STORAGE',
    'CLOUD_INFRASTRUCTURE',
    'AI_ML_DATA',
    'ARCHITECTURE_CONCEPT',
    'TOOL_PLATFORM',
    'DOMAIN_INDUSTRY',
    'LEADERSHIP_METHODOLOGY',
  ]),
  proficiency: z.enum(['EXPERT', 'PROFICIENT', 'FAMILIAR']),
  adjacentSkillSlugs: z
    .array(z.string())
    .describe('Closely transferable skills for minor gap bridging'),
  evidenceLinks: z
    .array(
      z.object({
        sourceBlockTempId: z
          .string()
          .describe('Must reference a tempExperienceId, tempBulletId, tempProjectId, or tempStoryId'),
        verbatimEvidenceExcerpt: z
          .string()
          .describe('Exact substring from the input document proving this skill'),
      })
    )
    .min(1, 'Every extracted skill must cite at least one verbatim evidence excerpt'),
});

export const CareerDocumentExtractionSchema = z.object({
  candidateMetadata: z
    .object({
      fullName: z.string().optional(),
      headline: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      locationCity: z.string().optional(),
      links: z
        .object({
          linkedinUrl: z.string().optional(),
          githubUrl: z.string().optional(),
          portfolioUrl: z.string().optional(),
        })
        .optional(),
      executiveBio: z.string().optional(),
    })
    .optional(),
  experiences: z.array(ExtractedExperienceSchema).default([]),
  projects: z.array(ExtractedProjectSchema).default([]),
  stories: z.array(ExtractedStarStorySchema).default([]),
  skills: z.array(ExtractedSkillWithEvidenceSchema).default([]),
  unverifiedSkillMentions: z
    .array(z.string())
    .describe(
      'Skills listed in a standalone "Skills" section of a resume that lack any supporting context in experiences or projects; surfaced in UI for user confirmation'
    )
    .default([]),
});

export type CareerDocumentExtraction = z.infer<typeof CareerDocumentExtractionSchema>;
