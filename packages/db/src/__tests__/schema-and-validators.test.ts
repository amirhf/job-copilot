import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  EMBEDDING_DIMENSIONS,
  candidateProfile,
  careerSources,
  careerExperiences,
  careerBullets,
  careerProjects,
  careerStories,
  careerSkills,
  careerSkillEvidence,
  jobPostings,
  fitEvaluations,
  applicationPackages,
  generationStreamEvents,
  preferenceMemory,
} from '../schema/index.js';
import {
  CareerDocumentExtractionSchema,
  NormalizedJobPostingSchema,
  Stage2RubricOutputSchema,
} from '../validators/index.js';
import {
  assertValidEmbeddingDimension,
  buildHybridSearchBulletsSql,
} from '../queries/hybrid-search.js';

describe('@job-copilot/db Schema & Contracts (Milestone 1)', () => {
  it('locks EMBEDDING_DIMENSIONS to 768 across all vector columns', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
    expect(careerExperiences.embedding.getSQLType()).toBe('vector(768)');
    expect(careerBullets.embedding.getSQLType()).toBe('vector(768)');
    expect(careerProjects.embedding.getSQLType()).toBe('vector(768)');
    expect(careerStories.embedding.getSQLType()).toBe('vector(768)');
    expect(careerSkills.embedding.getSQLType()).toBe('vector(768)');
    expect(jobPostings.embedding.getSQLType()).toBe('vector(768)');
    expect(preferenceMemory.embedding.getSQLType()).toBe('vector(768)');
  });

  it('defines all 13 core PostgreSQL tables with expected table names', () => {
    const tables = [
      candidateProfile,
      careerSources,
      careerExperiences,
      careerBullets,
      careerProjects,
      careerStories,
      careerSkills,
      careerSkillEvidence,
      jobPostings,
      fitEvaluations,
      applicationPackages,
      generationStreamEvents,
      preferenceMemory,
    ];
    expect(tables.map((t) => getTableName(t))).toEqual([
      'candidate_profile',
      'career_sources',
      'career_experiences',
      'career_bullets',
      'career_projects',
      'career_stories',
      'career_skills',
      'career_skill_evidence',
      'job_postings',
      'fit_evaluations',
      'application_packages',
      'generation_stream_events',
      'preference_memory',
    ]);
  });

  it('enforces Zero-Hallucination invariants in CareerDocumentExtractionSchema', () => {
    const validPayload = {
      experiences: [
        {
          tempExperienceId: 'exp_1',
          companyName: 'Acme Systems',
          normalizedCompanyName: 'acmesystems',
          jobTitle: 'Staff Engineer',
          startDate: '2023-01-01',
          endDate: null,
          isCurrent: true,
          roleOverview: 'Led core distributed data platform.',
          domainTags: ['distributed-systems'],
          primaryTechStack: ['TypeScript', 'PostgreSQL'],
          bullets: [
            {
              tempBulletId: 'exp_1_b_1',
              bulletText: 'Reduced p99 query latency by 42% using pgvector HNSW indexing.',
              actionVerb: 'Reduced',
              quantifiedMetrics: [
                {
                  metric: 'p99 query latency',
                  value: '42%',
                  isExactFromSource: true as const,
                },
              ],
              skillTags: ['PostgreSQL', 'pgvector'],
              impactScore: 92,
            },
          ],
        },
      ],
      skills: [
        {
          name: 'PostgreSQL',
          normalizedSlug: 'postgresql',
          category: 'DATABASE_STORAGE' as const,
          proficiency: 'EXPERT' as const,
          adjacentSkillSlugs: ['mysql', 'sqlite'],
          evidenceLinks: [
            {
              sourceBlockTempId: 'exp_1_b_1',
              verbatimEvidenceExcerpt: 'Reduced p99 query latency by 42% using pgvector HNSW indexing.',
            },
          ],
        },
      ],
      unverifiedSkillMentions: ['Rust'],
    };

    const parsed = CareerDocumentExtractionSchema.parse(validPayload);
    expect(parsed.skills[0]?.evidenceLinks).toHaveLength(1);
    expect(parsed.unverifiedSkillMentions).toEqual(['Rust']);

    // Rejects a skill with zero evidence links
    expect(() =>
      CareerDocumentExtractionSchema.parse({
        ...validPayload,
        skills: [
          {
            ...validPayload.skills[0],
            evidenceLinks: [],
          },
        ],
      })
    ).toThrow(/at least one verbatim evidence excerpt/);
  });

  it('validates NormalizedJobPostingSchema and Stage2RubricOutputSchema', () => {
    const normalizedJob = NormalizedJobPostingSchema.parse({
      companyName: 'Linear',
      title: 'Staff Full-Stack Engineer',
      locationRaw: 'Remote (US)',
      locationBucket: 'us-remote',
      countryCode: 'US',
      remotePolicy: 'REMOTE_COUNTRY_LOCKED',
      allowedUtcOffsetRange: { min: -8, max: -5 },
      salaryMinUsd: 200000,
      salaryMaxUsd: 245000,
      offersVisaSponsorship: true,
      cleanDescriptionMarkdown: '# Staff Engineer\nBuild fast product software.',
      extractedRequirements: {
        mustHaveSkills: ['TypeScript', 'React', 'PostgreSQL'],
        niceToHaveSkills: ['GraphQL'],
        minYearsExperience: 6,
        seniorityLevel: 'STAFF_PRINCIPAL',
        domainKeywords: ['developer-tools'],
      },
      extractedQuestions: [
        {
          questionId: 'q_shipped',
          label: 'Describe a complex system you architected.',
          fieldType: 'LONG_TEXT',
          required: true,
        },
      ],
      requiredAttachments: {
        resume: true,
        coverLetter: 'OPTIONAL',
        portfolioUrl: false,
        otherFiles: [],
      },
      specialInstructions: [],
    });

    expect(normalizedJob.locationBucket).toBe('us-remote');

    const rubricEval = Stage2RubricOutputSchema.parse({
      categoryScores: {
        techStackAlignment: { score: 92, rationale: 'Exact match on TS + Postgres.' },
        seniorityAndScope: { score: 88, rationale: 'Staff-level scope verified.' },
        domainIndustryFit: { score: 85, rationale: 'Strong B2B SaaS background.' },
        companyStageCulture: { score: 90, rationale: 'High-craft engineering culture fit.' },
      },
      preferencePenaltyPoints: 0,
      executiveSummary: '- Strong match across stack and scope.',
      topMatchedBlockIds: {
        experienceIds: ['exp_1'],
        bulletIds: ['exp_1_b_1'],
        projectIds: [],
        skillIds: ['skill_pg'],
      },
      flaggedGaps: [],
    });

    expect(rubricEval.categoryScores.techStackAlignment.score).toBe(92);
  });

  it('compiles RRF hybrid search SQL and rejects non-768 embeddings', () => {
    expect(() => assertValidEmbeddingDimension([0.1, 0.2])).toThrow(/expected 768, got 2/);

    const valid768 = Array.from({ length: 768 }, (_, i) => Number((i * 0.001).toFixed(4)));
    const sqlObj = buildHybridSearchBulletsSql({
      profileId: '00000000-0000-0000-0000-000000000001',
      queryText: 'TypeScript PostgreSQL distributed systems',
      queryEmbedding: valid768,
    });

    const dialect = new PgDialect();
    const compiled = dialect.sqlToQuery(sqlObj);
    expect(compiled.sql).toContain('WITH vector_ranked AS');
    expect(compiled.sql).toContain('lexical_ranked AS');
    expect(compiled.sql).toContain('websearch_to_tsquery');
    expect(compiled.sql).toContain('60.0 + v.vec_rank');
  });
});
