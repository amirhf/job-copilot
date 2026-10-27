import {
  pgTable,
  uuid,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { candidateProfile } from './profile';
import { jobPostings } from './jobs';
import { EMBEDDING_DIMENSIONS, preferenceTypeEnum } from './enums';

// 13. Preference Memory (Continuous Self-Improvement Loop)
export const preferenceMemory = pgTable(
  'preference_memory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => candidateProfile.id, { onDelete: 'cascade' })
      .notNull(),
    sourceJobPostingId: uuid('source_job_posting_id').references(() => jobPostings.id, {
      onDelete: 'set null',
    }),
    preferenceType: preferenceTypeEnum('preference_type').notNull(),
    ruleStatement: text('rule_statement').notNull(),
    originalTextSnippet: text('original_text_snippet'),
    userEditedTextSnippet: text('user_edited_text_snippet'),
    applicableScopes: jsonb('applicable_scopes')
      .$type<Array<'RUBRIC_SCORING' | 'RESUME_BULLETS' | 'COVER_LETTER' | 'SCREENING_QA'>>()
      .notNull()
      .default([]),
    confidenceWeight: real('confidence_weight').default(1.0).notNull(),
    timesApplied: real('times_applied').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('preference_memory_profile_type_idx').on(table.profileId, table.preferenceType),
    index('preference_memory_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);
