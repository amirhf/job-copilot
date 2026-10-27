import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { EMBEDDING_DIMENSIONS, jobStatusEnum, remotePolicyEnum } from './enums';

export interface JobPostingSourceEntry {
  connector:
    | 'SERPAPI_GOOGLE_JOBS'
    | 'REMOTIVE'
    | 'ATS_DIRECT_SEARCH'
    | 'GMAIL_ALERT'
    | 'MANUAL_URL';
  sourceUrl: string;
  externalId?: string;
  discoveredAt: string;
}

export interface ExtractedApplicationQuestion {
  questionId: string;
  label: string;
  fieldType:
    | 'SHORT_TEXT'
    | 'LONG_TEXT'
    | 'SINGLE_SELECT'
    | 'MULTI_SELECT'
    | 'BOOLEAN'
    | 'NUMBER'
    | 'FILE_UPLOAD'
    | 'URL';
  required: boolean;
  options?: string[];
  maxLength?: number;
  placeholderOrHint?: string;
  selectorHint?: string;
}

export interface SpecialPostingInstruction {
  instructionType: 'EASTER_EGG_PHRASE' | 'COVER_LETTER_PROMPT' | 'FORMATTING_RULE' | 'SUBJECT_LINE';
  exactRequirement: string;
  sourceQuote: string;
}

export interface FlaggedSkillGap {
  gapId: string;
  requirementText: string;
  missingSkillName: string;
  severity: 'CRITICAL' | 'MODERATE' | 'MINOR';
  adjacentVerifiedSkills: Array<{
    skillId: string;
    skillName: string;
    rationale: string;
  }>;
  resolutionStatus: 'OPEN' | 'ADDED_TO_PROFILE' | 'BRIDGED' | 'IGNORED';
  resolutionNote?: string;
  createdCareerSkillId?: string;
  resolvedAt?: string;
}

// 9. Job Postings
export const jobPostings = pgTable(
  'job_postings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dedupFingerprint: text('dedup_fingerprint').notNull(),
    companyName: text('company_name').notNull(),
    normalizedCompanyName: text('normalized_company_name').notNull(),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull(),
    locationRaw: text('location_raw').notNull(),
    locationBucket: text('location_bucket').notNull(),
    countryCode: text('country_code').default('US'),
    remotePolicy: remotePolicyEnum('remote_policy').default('UNKNOWN').notNull(),
    allowedUtcOffsetRange: jsonb('allowed_utc_offset_range').$type<{
      min?: number;
      max?: number;
    }>(),
    salaryMinUsd: integer('salary_min_usd'),
    salaryMaxUsd: integer('salary_max_usd'),
    salaryRawText: text('salary_raw_text'),
    offersVisaSponsorship: boolean('offers_visa_sponsorship'),
    atsPlatform: text('ats_platform'),
    applicationUrl: text('application_url').notNull(),
    sources: jsonb('sources').$type<JobPostingSourceEntry[]>().notNull().default([]),
    rawDescriptionHtml: text('raw_description_html'),
    cleanDescriptionMarkdown: text('clean_description_markdown').notNull(),
    extractedRequirements: jsonb('extracted_requirements')
      .$type<{
        mustHaveSkills: string[];
        niceToHaveSkills: string[];
        minYearsExperience?: number | null;
        seniorityLevel?: string;
        domainKeywords: string[];
      }>()
      .notNull()
      .default({ mustHaveSkills: [], niceToHaveSkills: [], domainKeywords: [] }),
    extractedQuestions: jsonb('extracted_questions')
      .$type<ExtractedApplicationQuestion[]>()
      .notNull()
      .default([]),
    requiredAttachments: jsonb('required_attachments')
      .$type<{
        resume: boolean;
        coverLetter: 'REQUIRED' | 'OPTIONAL' | 'NONE';
        portfolioUrl: boolean;
        otherFiles: string[];
      }>()
      .notNull()
      .default({ resume: true, coverLetter: 'OPTIONAL', portfolioUrl: false, otherFiles: [] }),
    specialInstructions: jsonb('special_instructions')
      .$type<SpecialPostingInstruction[]>()
      .notNull()
      .default([]),
    status: jobStatusEnum('status').default('INGESTED').notNull(),
    rejectionReasonCategory: text('rejection_reason_category'),
    rejectionUserNotes: text('rejection_user_notes'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('job_postings_dedup_fingerprint_idx').on(table.dedupFingerprint),
    index('job_postings_status_idx').on(table.status),
    index('job_postings_company_idx').on(table.normalizedCompanyName),
    index('job_postings_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

// 10. Two-Stage Fit Evaluations
export const fitEvaluations = pgTable(
  'fit_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobPostingId: uuid('job_posting_id')
      .references(() => jobPostings.id, { onDelete: 'cascade' })
      .notNull(),
    stage1Passed: boolean('stage1_passed').notNull(),
    stage1KnockoutReasons: jsonb('stage1_knockout_reasons')
      .$type<
        Array<{
          rule: string;
          expected: string;
          actual: string;
        }>
      >()
      .notNull()
      .default([]),
    overallScore: integer('overall_score'),
    categoryScores: jsonb('category_scores').$type<{
      techStackAlignment: { score: number; weight: number; rationale: string };
      seniorityAndScope: { score: number; weight: number; rationale: string };
      domainIndustryFit: { score: number; weight: number; rationale: string };
      companyStageCulture: { score: number; weight: number; rationale: string };
    }>(),
    executiveSummary: text('executive_summary'),
    topMatchedBlockIds: jsonb('top_matched_block_ids')
      .$type<{
        experienceIds: string[];
        bulletIds: string[];
        projectIds: string[];
        skillIds: string[];
      }>()
      .default({ experienceIds: [], bulletIds: [], projectIds: [], skillIds: [] }),
    flaggedGaps: jsonb('flagged_gaps').$type<FlaggedSkillGap[]>().notNull().default([]),
    hasUnresolvedCriticalGap: boolean('has_unresolved_critical_gap').default(false).notNull(),
    evaluatorModelUsed: text('evaluator_model_used'),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fit_evaluations_job_posting_idx').on(table.jobPostingId),
    index('fit_evaluations_overall_score_idx').on(table.overallScore),
  ]
);
