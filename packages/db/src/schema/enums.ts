import { pgEnum } from 'drizzle-orm/pg-core';

export const EMBEDDING_DIMENSIONS = 768;

export const jobStatusEnum = pgEnum('job_status', [
  'INGESTED',           // Raw posting fetched, awaiting Stage 1 filter
  'FILTERED_OUT',       // Failed Stage 1 deterministic hard filters
  'TRIAGE_INBOX',       // Passed Stage 1 + Stage 2 scored; awaiting human review (Surface A)
  'REJECTED',           // Rejected by user in Triage Inbox or Studio (feeds preference_memory)
  'APPROVED',           // Approved by user; queued in Surface B awaiting generation trigger
  'GENERATING',         // Async Trigger.dev + Mastra workflow actively running
  'PAUSED_NEEDS_INPUT', // Workflow suspended on critical skill gap awaiting user resolution
  'READY_TO_APPLY',     // Materials compiled & audited; ready in Surface C Studio
  'APPLYING',           // Stagehand v4 local headed session currently active
  'APPLIED',            // Confirmed submitted; immutable snapshot archived in Surface D
  'ARCHIVED',           // Closed, expired, or withdrawn
]);

export const remotePolicyEnum = pgEnum('remote_policy', [
  'REMOTE_GLOBAL',
  'REMOTE_COUNTRY_LOCKED',
  'REMOTE_TIMEZONE_LOCKED',
  'HYBRID',
  'ONSITE',
  'UNKNOWN',
]);

export const skillCategoryEnum = pgEnum('skill_category', [
  'LANGUAGE',
  'FRAMEWORK_LIBRARY',
  'DATABASE_STORAGE',
  'CLOUD_INFRASTRUCTURE',
  'AI_ML_DATA',
  'ARCHITECTURE_CONCEPT',
  'TOOL_PLATFORM',
  'DOMAIN_INDUSTRY',
  'LEADERSHIP_METHODOLOGY',
]);

export const skillProficiencyEnum = pgEnum('skill_proficiency', [
  'EXPERT',       // Production ownership, deep architectural mastery
  'PROFICIENT',   // Hands-on production shipping experience
  'FAMILIAR',     // Side projects, coursework, or adjacent exposure
]);

export const sourceTypeEnum = pgEnum('career_source_type', [
  'RESUME_UPLOAD',
  'PROJECT_DOC',
  'PORTFOLIO_URL',
  'GITHUB_REPO',
  'GAP_RESOLUTION_PROMPT',
  'MANUAL_UI_ENTRY',
]);

export const gapSeverityEnum = pgEnum('gap_severity', [
  'CRITICAL', // Mandatory knockout/core requirement missing; triggers workflow .suspend()
  'MODERATE', // Important requirement; can be bridged with adjacent skill or inline prompt
  'MINOR',    // Nice-to-have; auto-bridged or safely omitted
]);

export const gapResolutionStatusEnum = pgEnum('gap_resolution_status', [
  'OPEN',
  'ADDED_TO_PROFILE', // User supplied new evidence -> saved to Master Career Graph
  'BRIDGED',          // User instructed agent to emphasize adjacent verified skill
  'IGNORED',          // User chose to proceed without addressing
]);

export const generationStepEnum = pgEnum('generation_step', [
  'QUEUED',
  'ANALYZING_REQUIREMENTS',
  'SELECTING_CAREER_BLOCKS',
  'CHECKING_CRITICAL_GAPS',
  'PAUSED_ON_GAP',
  'SYNTHESIZING_RESUME',
  'SYNTHESIZING_COVER_LETTER_AND_QA',
  'COMPILING_AND_AUDITING_PDF',
  'COMPLETED',
  'FAILED',
]);

export const preferenceTypeEnum = pgEnum('preference_type', [
  'JOB_REJECTION_PATTERN', // Learned from Surface A Reject modal
  'RUBRIC_CALIBRATION',    // Adjustments to scoring sensitivity
  'PHRASING_REPLACEMENT',  // Learned from Studio "Save phrasing to Preference Memory" edits
  'TONE_AND_STYLE_RULE',   // Global writing guardrail (e.g., banned buzzwords, preferred verb style)
]);

export const applyModeEnum = pgEnum('apply_mode', [
  'STAGEHAND_HEADED', // Option B Primary
  'COPY_PASTE_KIT',   // Option A Fallback
  'MANUAL_DIRECT',
]);

export const postApplyStageEnum = pgEnum('post_apply_stage', [
  'APPLIED_AWAITING_RESPONSE',
  'RECRUITER_SCREEN',
  'TECHNICAL_INTERVIEW',
  'FINAL_ROUND',
  'OFFER_RECEIVED',
  'POST_APPLY_REJECTED',
  'WITHDRAWN',
]);
