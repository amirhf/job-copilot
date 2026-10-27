CREATE TYPE "public"."apply_mode" AS ENUM('STAGEHAND_HEADED', 'COPY_PASTE_KIT', 'MANUAL_DIRECT');--> statement-breakpoint
CREATE TYPE "public"."gap_resolution_status" AS ENUM('OPEN', 'ADDED_TO_PROFILE', 'BRIDGED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."gap_severity" AS ENUM('CRITICAL', 'MODERATE', 'MINOR');--> statement-breakpoint
CREATE TYPE "public"."generation_step" AS ENUM('QUEUED', 'ANALYZING_REQUIREMENTS', 'SELECTING_CAREER_BLOCKS', 'CHECKING_CRITICAL_GAPS', 'PAUSED_ON_GAP', 'SYNTHESIZING_RESUME', 'SYNTHESIZING_COVER_LETTER_AND_QA', 'COMPILING_AND_AUDITING_PDF', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('INGESTED', 'FILTERED_OUT', 'TRIAGE_INBOX', 'REJECTED', 'APPROVED', 'GENERATING', 'PAUSED_NEEDS_INPUT', 'READY_TO_APPLY', 'APPLYING', 'APPLIED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."post_apply_stage" AS ENUM('APPLIED_AWAITING_RESPONSE', 'RECRUITER_SCREEN', 'TECHNICAL_INTERVIEW', 'FINAL_ROUND', 'OFFER_RECEIVED', 'POST_APPLY_REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."preference_type" AS ENUM('JOB_REJECTION_PATTERN', 'RUBRIC_CALIBRATION', 'PHRASING_REPLACEMENT', 'TONE_AND_STYLE_RULE');--> statement-breakpoint
CREATE TYPE "public"."remote_policy" AS ENUM('REMOTE_GLOBAL', 'REMOTE_COUNTRY_LOCKED', 'REMOTE_TIMEZONE_LOCKED', 'HYBRID', 'ONSITE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('LANGUAGE', 'FRAMEWORK_LIBRARY', 'DATABASE_STORAGE', 'CLOUD_INFRASTRUCTURE', 'AI_ML_DATA', 'ARCHITECTURE_CONCEPT', 'TOOL_PLATFORM', 'DOMAIN_INDUSTRY', 'LEADERSHIP_METHODOLOGY');--> statement-breakpoint
CREATE TYPE "public"."skill_proficiency" AS ENUM('EXPERT', 'PROFICIENT', 'FAMILIAR');--> statement-breakpoint
CREATE TYPE "public"."career_source_type" AS ENUM('RESUME_UPLOAD', 'PROJECT_DOC', 'PORTFOLIO_URL', 'GITHUB_REPO', 'GAP_RESOLUTION_PROMPT', 'MANUAL_UI_ENTRY');--> statement-breakpoint
CREATE TABLE "candidate_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"headline" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"location_city" text NOT NULL,
	"location_country" text DEFAULT 'US' NOT NULL,
	"timezone_iana" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"utc_offset_hours" integer DEFAULT -8 NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"work_authorization" jsonb NOT NULL,
	"executive_bio" text,
	"total_years_experience" integer DEFAULT 0 NOT NULL,
	"target_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hard_filters" jsonb NOT NULL,
	"rubric_weights" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_bullets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"experience_id" uuid NOT NULL,
	"source_id" uuid,
	"bullet_text" text NOT NULL,
	"action_verb" text NOT NULL,
	"situation_and_task" text,
	"technical_approach" text,
	"quantified_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_verified_metric" boolean DEFAULT false NOT NULL,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impact_score" integer DEFAULT 50 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"source_id" uuid,
	"company_name" text NOT NULL,
	"normalized_company_name" text NOT NULL,
	"job_title" text NOT NULL,
	"employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
	"location" text,
	"remote_policy" "remote_policy" DEFAULT 'UNKNOWN',
	"start_date" date NOT NULL,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"company_stage_and_context" text,
	"role_overview" text NOT NULL,
	"domain_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"source_id" uuid,
	"linked_experience_id" uuid,
	"project_name" text NOT NULL,
	"tagline" text NOT NULL,
	"problem_statement" text NOT NULL,
	"architecture_and_stack" text NOT NULL,
	"quantified_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlight_bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tech_stack_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repository_url" text,
	"live_demo_url" text,
	"start_date" date,
	"end_date" date,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_skill_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"experience_id" uuid,
	"bullet_id" uuid,
	"project_id" uuid,
	"story_id" uuid,
	"verbatim_evidence_excerpt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_slug" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" "skill_category" NOT NULL,
	"proficiency" "skill_proficiency" DEFAULT 'PROFICIENT' NOT NULL,
	"years_of_experience" integer,
	"last_used_year" integer,
	"adjacent_skill_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_user_verified" boolean DEFAULT true NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"source_type" "career_source_type" NOT NULL,
	"title" text NOT NULL,
	"source_url_or_path" text,
	"raw_markdown_content" text NOT NULL,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"source_id" uuid,
	"linked_experience_id" uuid,
	"linked_project_id" uuid,
	"title" text NOT NULL,
	"situation" text NOT NULL,
	"task" text NOT NULL,
	"action" text NOT NULL,
	"result" text NOT NULL,
	"quantified_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"stage1_passed" boolean NOT NULL,
	"stage1_knockout_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overall_score" integer,
	"category_scores" jsonb,
	"executive_summary" text,
	"top_matched_block_ids" jsonb DEFAULT '{"experienceIds":[],"bulletIds":[],"projectIds":[],"skillIds":[]}'::jsonb,
	"flagged_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_unresolved_critical_gap" boolean DEFAULT false NOT NULL,
	"evaluator_model_used" text,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_fingerprint" text NOT NULL,
	"company_name" text NOT NULL,
	"normalized_company_name" text NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"location_raw" text NOT NULL,
	"location_bucket" text NOT NULL,
	"country_code" text DEFAULT 'US',
	"remote_policy" "remote_policy" DEFAULT 'UNKNOWN' NOT NULL,
	"allowed_utc_offset_range" jsonb,
	"salary_min_usd" integer,
	"salary_max_usd" integer,
	"salary_raw_text" text,
	"offers_visa_sponsorship" boolean,
	"ats_platform" text,
	"application_url" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_description_html" text,
	"clean_description_markdown" text NOT NULL,
	"extracted_requirements" jsonb DEFAULT '{"mustHaveSkills":[],"niceToHaveSkills":[],"domainKeywords":[]}'::jsonb NOT NULL,
	"extracted_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_attachments" jsonb DEFAULT '{"resume":true,"coverLetter":"OPTIONAL","portfolioUrl":false,"otherFiles":[]}'::jsonb NOT NULL,
	"special_instructions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'INGESTED' NOT NULL,
	"rejection_reason_category" text,
	"rejection_user_notes" text,
	"embedding" vector(768),
	"posted_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_immutable_snapshot" boolean DEFAULT false NOT NULL,
	"trigger_run_id" text,
	"mastra_workflow_run_id" text,
	"current_step" "generation_step" DEFAULT 'QUEUED' NOT NULL,
	"stream_channel_id" text,
	"tailored_resume_data" jsonb,
	"resume_typst_source" text,
	"cover_letter_markdown" text,
	"cover_letter_typst_source" text,
	"screening_question_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_audit" jsonb,
	"storage_provider" text DEFAULT 'postgres' NOT NULL,
	"compiled_resume_pdf_base64" text,
	"compiled_cover_letter_pdf_base64" text,
	"compiled_resume_pdf_path" text,
	"compiled_cover_letter_pdf_path" text,
	"synthesis_model_used" text DEFAULT 'claude-sonnet-4-6' NOT NULL,
	"apply_mode" "apply_mode",
	"post_apply_stage" "post_apply_stage" DEFAULT 'APPLIED_AWAITING_RESPONSE',
	"stagehand_session_log" jsonb,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_stream_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"stream_channel_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preference_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"source_job_posting_id" uuid,
	"preference_type" "preference_type" NOT NULL,
	"rule_statement" text NOT NULL,
	"original_text_snippet" text,
	"user_edited_text_snippet" text,
	"applicable_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_weight" real DEFAULT 1 NOT NULL,
	"times_applied" real DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "career_bullets" ADD CONSTRAINT "career_bullets_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_bullets" ADD CONSTRAINT "career_bullets_experience_id_career_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."career_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_bullets" ADD CONSTRAINT "career_bullets_source_id_career_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."career_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD CONSTRAINT "career_experiences_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_experiences" ADD CONSTRAINT "career_experiences_source_id_career_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."career_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_projects" ADD CONSTRAINT "career_projects_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_projects" ADD CONSTRAINT "career_projects_source_id_career_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."career_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_projects" ADD CONSTRAINT "career_projects_linked_experience_id_career_experiences_id_fk" FOREIGN KEY ("linked_experience_id") REFERENCES "public"."career_experiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_skill_evidence" ADD CONSTRAINT "career_skill_evidence_skill_id_career_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."career_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_skill_evidence" ADD CONSTRAINT "career_skill_evidence_experience_id_career_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."career_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_skill_evidence" ADD CONSTRAINT "career_skill_evidence_bullet_id_career_bullets_id_fk" FOREIGN KEY ("bullet_id") REFERENCES "public"."career_bullets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_skill_evidence" ADD CONSTRAINT "career_skill_evidence_project_id_career_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."career_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_skill_evidence" ADD CONSTRAINT "career_skill_evidence_story_id_career_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."career_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_skills" ADD CONSTRAINT "career_skills_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_sources" ADD CONSTRAINT "career_sources_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_stories" ADD CONSTRAINT "career_stories_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_stories" ADD CONSTRAINT "career_stories_source_id_career_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."career_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_stories" ADD CONSTRAINT "career_stories_linked_experience_id_career_experiences_id_fk" FOREIGN KEY ("linked_experience_id") REFERENCES "public"."career_experiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_stories" ADD CONSTRAINT "career_stories_linked_project_id_career_projects_id_fk" FOREIGN KEY ("linked_project_id") REFERENCES "public"."career_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_evaluations" ADD CONSTRAINT "fit_evaluations_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_packages" ADD CONSTRAINT "application_packages_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_stream_events" ADD CONSTRAINT "generation_stream_events_package_id_application_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."application_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_memory" ADD CONSTRAINT "preference_memory_profile_id_candidate_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_memory" ADD CONSTRAINT "preference_memory_source_job_posting_id_job_postings_id_fk" FOREIGN KEY ("source_job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_bullets_experience_idx" ON "career_bullets" USING btree ("experience_id");--> statement-breakpoint
CREATE INDEX "career_bullets_embedding_hnsw_idx" ON "career_bullets" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "career_experiences_profile_idx" ON "career_experiences" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "career_experiences_embedding_hnsw_idx" ON "career_experiences" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "career_projects_profile_idx" ON "career_projects" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "career_projects_embedding_hnsw_idx" ON "career_projects" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "career_skill_evidence_skill_idx" ON "career_skill_evidence" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "career_skills_profile_slug_idx" ON "career_skills" USING btree ("profile_id","normalized_slug");--> statement-breakpoint
CREATE INDEX "career_skills_embedding_hnsw_idx" ON "career_skills" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "career_sources_profile_hash_idx" ON "career_sources" USING btree ("profile_id","content_hash");--> statement-breakpoint
CREATE INDEX "career_stories_profile_idx" ON "career_stories" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "career_stories_embedding_hnsw_idx" ON "career_stories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "fit_evaluations_job_posting_idx" ON "fit_evaluations" USING btree ("job_posting_id");--> statement-breakpoint
CREATE INDEX "fit_evaluations_overall_score_idx" ON "fit_evaluations" USING btree ("overall_score");--> statement-breakpoint
CREATE UNIQUE INDEX "job_postings_dedup_fingerprint_idx" ON "job_postings" USING btree ("dedup_fingerprint");--> statement-breakpoint
CREATE INDEX "job_postings_status_idx" ON "job_postings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_postings_company_idx" ON "job_postings" USING btree ("normalized_company_name");--> statement-breakpoint
CREATE INDEX "job_postings_embedding_hnsw_idx" ON "job_postings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "application_packages_job_posting_idx" ON "application_packages" USING btree ("job_posting_id");--> statement-breakpoint
CREATE INDEX "application_packages_trigger_run_idx" ON "application_packages" USING btree ("trigger_run_id");--> statement-breakpoint
CREATE INDEX "generation_stream_events_channel_seq_idx" ON "generation_stream_events" USING btree ("stream_channel_id","seq");--> statement-breakpoint
CREATE INDEX "preference_memory_profile_type_idx" ON "preference_memory" USING btree ("profile_id","preference_type");--> statement-breakpoint
CREATE INDEX "preference_memory_embedding_hnsw_idx" ON "preference_memory" USING hnsw ("embedding" vector_cosine_ops);