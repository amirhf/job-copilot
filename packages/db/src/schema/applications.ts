import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { jobPostings } from './jobs';
import { generationStepEnum, applyModeEnum, postApplyStageEnum } from './enums';

export interface TailoredResumePayload {
  targetHeadline: string;
  executiveSummary: string;
  selectedExperiences: Array<{
    experienceId: string;
    companyName: string;
    jobTitle: string;
    dateRangeText: string;
    locationText: string;
    tailoredBullets: Array<{
      sourceBulletId: string;
      originalText: string;
      tailoredText: string;
      bridgedSkillNote?: string;
    }>;
  }>;
  selectedProjects: Array<{
    projectId: string;
    projectName: string;
    tailoredSummary: string;
    tailoredHighlights: string[];
  }>;
  categorizedSkills: Array<{
    categoryLabel: string;
    skills: string[];
  }>;
}

export interface AnsweredScreeningQuestion {
  questionId: string;
  questionLabel: string;
  fieldType: string;
  draftedAnswer: string;
  userEditedAnswer?: string;
  citedCareerBlockIds: string[];
  specialInstructionSatisfied?: string;
}

export interface PdfCompilationAudit {
  pageCount: number;
  targetMaxPages: number;
  overflowDetected: boolean;
  atsKeywordCoveragePercent: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  specialInstructionsVerified: boolean;
  zeroHallucinationAuditPassed: boolean;
  auditWarnings: string[];
}

// 11. Application Packages (Draft Studio + Immutable Applied Snapshots)
export const applicationPackages = pgTable(
  'application_packages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobPostingId: uuid('job_posting_id')
      .references(() => jobPostings.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').default(1).notNull(),
    isImmutableSnapshot: boolean('is_immutable_snapshot').default(false).notNull(),
    // Watchable Async Execution metadata
    triggerRunId: text('trigger_run_id'),
    mastraWorkflowRunId: text('mastra_workflow_run_id'),
    currentStep: generationStepEnum('current_step').default('QUEUED').notNull(),
    streamChannelId: text('stream_channel_id'),
    // Tailored Content & Typst Source
    tailoredResumeData: jsonb('tailored_resume_data').$type<TailoredResumePayload>(),
    resumeTypstSource: text('resume_typst_source'),
    coverLetterMarkdown: text('cover_letter_markdown'),
    coverLetterTypstSource: text('cover_letter_typst_source'),
    screeningQuestionAnswers: jsonb('screening_question_answers')
      .$type<AnsweredScreeningQuestion[]>()
      .notNull()
      .default([]),
    // Compilation & Stateless Artifact Storage
    pdfAudit: jsonb('pdf_audit').$type<PdfCompilationAudit>(),
    storageProvider: text('storage_provider').default('postgres').notNull(), // 'postgres' | 'r2' | 'local-fs'
    compiledResumePdfBase64: text('compiled_resume_pdf_base64'),
    compiledCoverLetterPdfBase64: text('compiled_cover_letter_pdf_base64'),
    compiledResumePdfPath: text('compiled_resume_pdf_path'),
    compiledCoverLetterPdfPath: text('compiled_cover_letter_pdf_path'),
    // Assisted Apply & Submission Metadata
    synthesisModelUsed: text('synthesis_model_used').default('claude-sonnet-4-6').notNull(),
    applyMode: applyModeEnum('apply_mode'),
    postApplyStage: postApplyStageEnum('post_apply_stage').default('APPLIED_AWAITING_RESPONSE'),
    stagehandSessionLog: jsonb('stagehand_session_log').$type<{
      filledFieldsCount: number;
      ambiguousFieldsFlagged: string[];
      haltedAtSubmitAt?: string;
    }>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('application_packages_job_posting_idx').on(table.jobPostingId),
    index('application_packages_trigger_run_idx').on(table.triggerRunId),
  ]
);

// 12. Generation Stream Events (Zero-Redis Resumable SSE Event Log)
export const generationStreamEvents = pgTable(
  'generation_stream_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    packageId: uuid('package_id')
      .references(() => applicationPackages.id, { onDelete: 'cascade' })
      .notNull(),
    streamChannelId: text('stream_channel_id').notNull(),
    seq: integer('seq').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('generation_stream_events_channel_seq_idx').on(table.streamChannelId, table.seq),
  ]
);
