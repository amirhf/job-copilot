import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  EMBEDDING_DIMENSIONS,
  remotePolicyEnum,
  skillCategoryEnum,
  skillProficiencyEnum,
  sourceTypeEnum,
} from './enums';

export interface HardFiltersConfig {
  allowedRemotePolicies: Array<
    'REMOTE_GLOBAL' | 'REMOTE_COUNTRY_LOCKED' | 'REMOTE_TIMEZONE_LOCKED' | 'HYBRID' | 'ONSITE'
  >;
  allowedCountries: string[];
  allowedLocations: string[];
  allowedUtcOffsetRange: { min: number; max: number };
  minBaseSalaryUsd: number | null;
  allowUnlistedSalary: boolean;
  requiresVisaSponsorship: boolean;
  blacklistedCompanies: string[];
  blacklistedTitleKeywords: string[];
  blacklistedDescriptionKeywords: string[];
}

export interface RubricWeightsConfig {
  techStackAlignment: number;
  seniorityAndScope: number;
  domainIndustryFit: number;
  companyStageCulture: number;
}

export interface QuantifiedMetric {
  metric: string;
  value: string;
  context?: string;
  isExactFromSource: boolean;
}

// 1. Candidate Profile & Global Search/Rubric Config
export const candidateProfile = pgTable('candidate_profile', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: text('full_name').notNull(),
  headline: text('headline').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  locationCity: text('location_city').notNull(),
  locationCountry: text('location_country').notNull().default('US'),
  timezoneIana: text('timezone_iana').notNull().default('America/Los_Angeles'),
  utcOffsetHours: integer('utc_offset_hours').notNull().default(-8),
  links: jsonb('links')
    .$type<{
      linkedinUrl?: string;
      githubUrl?: string;
      portfolioUrl?: string;
      scholarUrl?: string;
      otherUrls?: Array<{ label: string; url: string }>;
    }>()
    .notNull()
    .default({}),
  workAuthorization: jsonb('work_authorization')
    .$type<{
      authorizedCountries: string[];
      requiresSponsorship: boolean;
      visaStatusNote?: string;
    }>()
    .notNull(),
  executiveBio: text('executive_bio'),
  totalYearsExperience: integer('total_years_experience').notNull().default(0),
  targetRoles: jsonb('target_roles').$type<string[]>().notNull().default([]),
  hardFilters: jsonb('hard_filters').$type<HardFiltersConfig>().notNull(),
  rubricWeights: jsonb('rubric_weights').$type<RubricWeightsConfig>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Provenance / Uploaded Sources
export const careerSources = pgTable(
  'career_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    title: text('title').notNull(),
    sourceUrlOrPath: text('source_url_or_path'),
    rawMarkdownContent: text('raw_markdown_content').notNull(),
    contentHash: text('content_hash').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('career_sources_profile_hash_idx').on(table.profileId, table.contentHash)]
);

// 3. Career Experiences (Role-Level Context)
export const careerExperiences = pgTable(
  'career_experiences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: uuid('source_id').references(() => careerSources.id, { onDelete: 'set null' }),
    companyName: text('company_name').notNull(),
    normalizedCompanyName: text('normalized_company_name').notNull(),
    jobTitle: text('job_title').notNull(),
    employmentType: text('employment_type').default('FULL_TIME').notNull(),
    location: text('location'),
    remotePolicy: remotePolicyEnum('remote_policy').default('UNKNOWN'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    isCurrent: boolean('is_current').default(false).notNull(),
    companyStageAndContext: text('company_stage_and_context'),
    roleOverview: text('role_overview').notNull(),
    domainTags: jsonb('domain_tags').$type<string[]>().notNull().default([]),
    primaryTechStack: jsonb('primary_tech_stack').$type<string[]>().notNull().default([]),
    displayOrder: integer('display_order').notNull().default(0),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('career_experiences_profile_idx').on(table.profileId),
    index('career_experiences_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

// 4. Atomic Achievement Bullets (Granular Retrieval Units)
export const careerBullets = pgTable(
  'career_bullets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    experienceId: uuid('experience_id')
      .references(() => careerExperiences.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: uuid('source_id').references(() => careerSources.id, { onDelete: 'set null' }),
    bulletText: text('bullet_text').notNull(),
    actionVerb: text('action_verb').notNull(),
    situationAndTask: text('situation_and_task'),
    technicalApproach: text('technical_approach'),
    quantifiedMetrics: jsonb('quantified_metrics')
      .$type<QuantifiedMetric[]>()
      .notNull()
      .default([]),
    hasVerifiedMetric: boolean('has_verified_metric').default(false).notNull(),
    skillTags: jsonb('skill_tags').$type<string[]>().notNull().default([]),
    impactScore: integer('impact_score').default(50).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('career_bullets_experience_idx').on(table.experienceId),
    index('career_bullets_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

// 5. Career Projects (Open-Source, Capstones, Deep Technical Systems)
export const careerProjects = pgTable(
  'career_projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: uuid('source_id').references(() => careerSources.id, { onDelete: 'set null' }),
    linkedExperienceId: uuid('linked_experience_id').references(() => careerExperiences.id, {
      onDelete: 'set null',
    }),
    projectName: text('project_name').notNull(),
    tagline: text('tagline').notNull(),
    problemStatement: text('problem_statement').notNull(),
    architectureAndStack: text('architecture_and_stack').notNull(),
    quantifiedOutcomes: jsonb('quantified_outcomes')
      .$type<QuantifiedMetric[]>()
      .notNull()
      .default([]),
    highlightBullets: jsonb('highlight_bullets').$type<string[]>().notNull().default([]),
    techStackTags: jsonb('tech_stack_tags').$type<string[]>().notNull().default([]),
    repositoryUrl: text('repository_url'),
    liveDemoUrl: text('live_demo_url'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('career_projects_profile_idx').on(table.profileId),
    index('career_projects_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

// 6. STAR Stories (Behavioral & Custom Screening Narratives)
export const careerStories = pgTable(
  'career_stories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: uuid('source_id').references(() => careerSources.id, { onDelete: 'set null' }),
    linkedExperienceId: uuid('linked_experience_id').references(() => careerExperiences.id, {
      onDelete: 'set null',
    }),
    linkedProjectId: uuid('linked_project_id').references(() => careerProjects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    situation: text('situation').notNull(),
    task: text('task').notNull(),
    action: text('action').notNull(),
    result: text('result').notNull(),
    quantifiedMetrics: jsonb('quantified_metrics')
      .$type<QuantifiedMetric[]>()
      .notNull()
      .default([]),
    themes: jsonb('themes').$type<string[]>().notNull().default([]),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('career_stories_profile_idx').on(table.profileId),
    index('career_stories_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

// 7. Normalized Career Skills
export const careerSkills = pgTable(
  'career_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    normalizedSlug: text('normalized_slug').notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    category: skillCategoryEnum('category').notNull(),
    proficiency: skillProficiencyEnum('proficiency').notNull().default('PROFICIENT'),
    yearsOfExperience: integer('years_of_experience'),
    lastUsedYear: integer('last_used_year'),
    adjacentSkillSlugs: jsonb('adjacent_skill_slugs').$type<string[]>().notNull().default([]),
    isUserVerified: boolean('is_user_verified').default(true).notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('career_skills_profile_slug_idx').on(table.profileId, table.normalizedSlug),
    index('career_skills_embedding_hnsw_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ]
);

// 8. Skill Evidence Links (Enforces Zero Hallucination)
export const careerSkillEvidence = pgTable(
  'career_skill_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    skillId: uuid('skill_id')
      .references(() => careerSkills.id, { onDelete: 'cascade' })
      .notNull(),
    experienceId: uuid('experience_id').references(() => careerExperiences.id, {
      onDelete: 'cascade',
    }),
    bulletId: uuid('bullet_id').references(() => careerBullets.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => careerProjects.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').references(() => careerStories.id, { onDelete: 'cascade' }),
    verbatimEvidenceExcerpt: text('verbatim_evidence_excerpt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('career_skill_evidence_skill_idx').on(table.skillId)]
);
