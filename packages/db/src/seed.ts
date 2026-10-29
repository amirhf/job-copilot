import { createHash } from 'node:crypto';
import {
  db,
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
  preferenceMemory,
} from './index';

export function buildSeedEmbedding(seedText: string): number[] {
  const hash = createHash('sha256').update(seedText, 'utf8').digest();
  const vec: number[] = new Array(EMBEDDING_DIMENSIONS);
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const byteVal = hash[i % hash.length] ?? 0;
    const val = ((byteVal + ((i * 17) % 256)) % 256) / 128 - 1;
    vec[i] = val;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function buildDeterministicSeedDataset() {
  const profileId = '00000000-0000-4000-8000-000000000001';
  const sourceResumeId = '00000000-0000-4000-8000-000000000010';
  const expAcmeId = '00000000-0000-4000-8000-000000000020';
  const expStripeId = '00000000-0000-4000-8000-000000000021';
  const bullet1Id = '00000000-0000-4000-8000-000000000030';
  const bullet2Id = '00000000-0000-4000-8000-000000000031';
  const bullet3Id = '00000000-0000-4000-8000-000000000032';
  const projRouterId = '00000000-0000-4000-8000-000000000040';
  const storyMigrationId = '00000000-0000-4000-8000-000000000050';

  const skillTsId = '00000000-0000-4000-8000-000000000060';
  const skillPgId = '00000000-0000-4000-8000-000000000061';
  const skillNextId = '00000000-0000-4000-8000-000000000062';
  const skillAwsEcsId = '00000000-0000-4000-8000-000000000063';
  const skillUnverifiedRustId = '00000000-0000-4000-8000-000000000069';

  const jobLinearId = '00000000-0000-4000-8000-000000000101';
  const jobAnthropicId = '00000000-0000-4000-8000-000000000102';
  const jobSupabaseId = '00000000-0000-4000-8000-000000000103';
  const jobRetoolAppliedId = '00000000-0000-4000-8000-000000000104';

  return {
    profile: {
      id: profileId,
      fullName: 'Alex Rivera',
      headline: 'Staff AI & Distributed Systems Engineer',
      email: 'alex.rivera@example.com',
      phone: '+1-415-555-0192',
      locationCity: 'San Francisco, CA',
      locationCountry: 'US',
      timezoneIana: 'America/Los_Angeles',
      utcOffsetHours: -8,
      links: {
        linkedinUrl: 'https://linkedin.com/in/alexrivera',
        githubUrl: 'https://github.com/alexrivera',
        portfolioUrl: 'https://alexrivera.dev',
      },
      workAuthorization: {
        authorizedCountries: ['US'],
        requiresSponsorship: false,
        visaStatusNote: 'US Citizen',
      },
      executiveBio:
        'Staff Engineer with 8+ years architecting TypeScript monorepos, multi-agent LLM orchestration engines, and high-throughput PostgreSQL/pgvector data systems.',
      totalYearsExperience: 8,
      targetRoles: [
        'Staff Software Engineer',
        'Staff AI Platform Engineer',
        'Principal Systems Engineer',
      ],
      hardFilters: {
        allowedRemotePolicies: [
          'REMOTE_GLOBAL' as const,
          'REMOTE_COUNTRY_LOCKED' as const,
          'REMOTE_TIMEZONE_LOCKED' as const,
          'HYBRID' as const,
        ],
        allowedCountries: ['US', 'CA'],
        allowedLocations: ['San Francisco, CA', 'Remote'],
        allowedUtcOffsetRange: { min: -8, max: -4 },
        minBaseSalaryUsd: 185000,
        allowUnlistedSalary: true,
        requiresVisaSponsorship: false,
        blacklistedCompanies: ['Stealth Bodyshop Inc'],
        blacklistedTitleKeywords: ['Intern', 'Junior', 'WordPress'],
        blacklistedDescriptionKeywords: [],
      },
      rubricWeights: {
        techStackAlignment: 0.35,
        seniorityAndScope: 0.25,
        domainIndustryFit: 0.2,
        companyStageCulture: 0.2,
      },
    },
    source: {
      id: sourceResumeId,
      profileId,
      sourceType: 'RESUME_UPLOAD' as const,
      title: 'Alex_Rivera_Master_Resume_2026.md',
      rawMarkdownContent:
        '# Alex Rivera — Staff AI & Distributed Systems Engineer\n- Cut p99 API latency by 42% across 12 services using PostgreSQL pgvector.\n- Saved $240K annually on cloud compute via AWS ECS autoscaling.\n- Architected multi-agent workflow engine in TypeScript handling 1.2M daily runs.',
      contentHash: 'seed_master_resume_hash_2026',
    },
    experiences: [
      {
        id: expAcmeId,
        profileId,
        sourceId: sourceResumeId,
        companyName: 'Acme AI Cloud',
        normalizedCompanyName: 'acme ai cloud',
        jobTitle: 'Staff AI Platform Engineer',
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA',
        remotePolicy: 'HYBRID' as const,
        startDate: '2022-03-01',
        endDate: null,
        isCurrent: true,
        roleOverview:
          'Technical lead for multi-agent workflow orchestration and hybrid search infrastructure.',
        domainTags: ['AI Infrastructure', 'Developer Tools', 'Distributed Systems'],
        primaryTechStack: ['TypeScript', 'Next.js', 'PostgreSQL', 'pgvector', 'AWS ECS'],
        displayOrder: 0,
        embedding: buildSeedEmbedding('Staff AI Platform Engineer at Acme AI Cloud'),
      },
      {
        id: expStripeId,
        profileId,
        sourceId: sourceResumeId,
        companyName: 'FinScale Systems',
        normalizedCompanyName: 'finscale systems',
        jobTitle: 'Senior Backend Systems Engineer',
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA',
        remotePolicy: 'REMOTE_COUNTRY_LOCKED' as const,
        startDate: '2018-06-01',
        endDate: '2022-02-28',
        isCurrent: false,
        roleOverview: 'Built high-throughput payment ledger and webhook delivery pipelines.',
        domainTags: ['Fintech', 'Payments', 'High Availability'],
        primaryTechStack: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
        displayOrder: 1,
        embedding: buildSeedEmbedding('Senior Backend Systems Engineer at FinScale Systems'),
      },
    ],
    bullets: [
      {
        id: bullet1Id,
        profileId,
        experienceId: expAcmeId,
        sourceId: sourceResumeId,
        bulletText:
          'Architected multi-agent workflow engine in TypeScript handling 1.2M daily runs with 99.98% durability.',
        actionVerb: 'Architected',
        quantifiedMetrics: [
          { metric: 'daily runs', value: '1.2M', isExactFromSource: true },
          { metric: 'durability', value: '99.98%', isExactFromSource: true },
        ],
        hasVerifiedMetric: true,
        skillTags: ['TypeScript', 'Node.js', 'PostgreSQL'],
        impactScore: 95,
        isFeatured: true,
        displayOrder: 0,
        embedding: buildSeedEmbedding('Architected multi-agent workflow engine in TypeScript 1.2M daily runs'),
      },
      {
        id: bullet2Id,
        profileId,
        experienceId: expAcmeId,
        sourceId: sourceResumeId,
        bulletText:
          'Cut p99 API latency by 42% across 12 services by designing a PostgreSQL pgvector + tsvector RRF hybrid search layer.',
        actionVerb: 'Cut',
        quantifiedMetrics: [
          { metric: 'p99 latency reduction', value: '42%', isExactFromSource: true },
          { metric: 'services', value: '12', isExactFromSource: true },
        ],
        hasVerifiedMetric: true,
        skillTags: ['PostgreSQL', 'pgvector', 'TypeScript'],
        impactScore: 92,
        isFeatured: true,
        displayOrder: 1,
        embedding: buildSeedEmbedding('Cut p99 API latency by 42% PostgreSQL pgvector RRF hybrid search'),
      },
      {
        id: bullet3Id,
        profileId,
        experienceId: expStripeId,
        sourceId: sourceResumeId,
        bulletText:
          'Optimized AWS ECS container scheduling and Next.js control plane, saving $240K annually on compute.',
        actionVerb: 'Optimized',
        quantifiedMetrics: [
          { metric: 'annual compute savings', value: '$240K', isExactFromSource: true },
        ],
        hasVerifiedMetric: true,
        skillTags: ['AWS ECS', 'Next.js', 'TypeScript'],
        impactScore: 88,
        isFeatured: true,
        displayOrder: 0,
        embedding: buildSeedEmbedding('Optimized AWS ECS container scheduling saving $240K annually'),
      },
    ],
    projects: [
      {
        id: projRouterId,
        profileId,
        sourceId: sourceResumeId,
        linkedExperienceId: expAcmeId,
        projectName: 'Durable Agentic Workflow Router',
        tagline: 'Zero-Redis resumable SSE and human-in-the-loop suspend/resume engine',
        problemStatement: 'Serverless multi-agent workflows lose state during human review pauses.',
        architectureAndStack: 'TypeScript, PostgreSQL 17, Drizzle ORM, Next.js App Router',
        quantifiedOutcomes: [
          { metric: 'cold-start overhead', value: '<15ms', isExactFromSource: true },
        ],
        highlightBullets: [
          'Implemented sequence-numbered SSE event replay over standard pooled PostgreSQL.',
        ],
        techStackTags: ['TypeScript', 'PostgreSQL', 'Next.js'],
        repositoryUrl: 'https://github.com/alexrivera/agentic-router',
        embedding: buildSeedEmbedding('Durable Agentic Workflow Router TypeScript PostgreSQL'),
      },
    ],
    stories: [
      {
        id: storyMigrationId,
        profileId,
        sourceId: sourceResumeId,
        linkedExperienceId: expAcmeId,
        title: 'Zero-Downtime Vector Search Migration',
        situation: 'Legacy Elasticsearch cluster cost $18K/month and suffered frequent split-brain incidents.',
        task: 'Migrate 40M embeddings to PostgreSQL 17 pgvector with zero downtime.',
        action: 'Designed dual-write backfill pipeline and Reciprocal Rank Fusion (RRF k=60) hybrid query layer.',
        result: 'Reduced p99 search latency by 42% and saved $216K/year in infrastructure cost.',
        quantifiedMetrics: [
          { metric: 'latency reduction', value: '42%', isExactFromSource: true },
        ],
        themes: ['Architecture Migration', 'Cost Optimization', 'Technical Leadership'],
        embedding: buildSeedEmbedding('Zero-Downtime Vector Search Migration PostgreSQL pgvector'),
      },
    ],
    skills: [
      {
        id: skillTsId,
        profileId,
        name: 'TypeScript',
        normalizedSlug: 'typescript',
        aliases: ['ts'],
        category: 'LANGUAGE' as const,
        proficiency: 'EXPERT' as const,
        isUserVerified: true,
        embedding: buildSeedEmbedding('TypeScript LANGUAGE EXPERT'),
      },
      {
        id: skillPgId,
        profileId,
        name: 'PostgreSQL',
        normalizedSlug: 'postgresql',
        aliases: ['postgres', 'pgvector'],
        category: 'DATABASE_STORAGE' as const,
        proficiency: 'EXPERT' as const,
        isUserVerified: true,
        embedding: buildSeedEmbedding('PostgreSQL pgvector DATABASE_STORAGE EXPERT'),
      },
      {
        id: skillNextId,
        profileId,
        name: 'Next.js',
        normalizedSlug: 'nextjs',
        aliases: ['react'],
        category: 'FRAMEWORK_LIBRARY' as const,
        proficiency: 'EXPERT' as const,
        isUserVerified: true,
        embedding: buildSeedEmbedding('Next.js React FRAMEWORK_LIBRARY EXPERT'),
      },
      {
        id: skillAwsEcsId,
        profileId,
        name: 'AWS ECS',
        normalizedSlug: 'aws-ecs',
        aliases: ['docker', 'containers'],
        category: 'CLOUD_INFRASTRUCTURE' as const,
        proficiency: 'PROFICIENT' as const,
        isUserVerified: true,
        embedding: buildSeedEmbedding('AWS ECS Docker CLOUD_INFRASTRUCTURE PROFICIENT'),
      },
      {
        id: skillUnverifiedRustId,
        profileId,
        name: 'Rust FFI',
        normalizedSlug: 'rust-ffi',
        aliases: [],
        category: 'LANGUAGE' as const,
        proficiency: 'FAMILIAR' as const,
        isUserVerified: false,
        embedding: buildSeedEmbedding('Rust FFI unverified'),
      },
    ],
    evidenceLinks: [
      {
        skillId: skillTsId,
        experienceId: expAcmeId,
        bulletId: bullet1Id,
        verbatimEvidenceExcerpt:
          'Architected multi-agent workflow engine in TypeScript handling 1.2M daily runs.',
      },
      {
        skillId: skillPgId,
        experienceId: expAcmeId,
        bulletId: bullet2Id,
        verbatimEvidenceExcerpt:
          'Cut p99 API latency by 42% across 12 services by designing a PostgreSQL pgvector + tsvector RRF hybrid search layer.',
      },
      {
        skillId: skillNextId,
        experienceId: expStripeId,
        bulletId: bullet3Id,
        verbatimEvidenceExcerpt:
          'Optimized AWS ECS container scheduling and Next.js control plane, saving $240K annually.',
      },
      {
        skillId: skillAwsEcsId,
        experienceId: expStripeId,
        bulletId: bullet3Id,
        verbatimEvidenceExcerpt:
          'Optimized AWS ECS container scheduling and Next.js control plane, saving $240K annually.',
      },
    ],
    jobs: [
      {
        id: jobLinearId,
        dedupFingerprint: 'seed_fp_linear_staff_ai_platform',
        companyName: 'Linear',
        normalizedCompanyName: 'linear',
        title: 'Staff AI Platform Engineer',
        normalizedTitle: 'staff ai platform engineer',
        locationRaw: 'San Francisco, CA or Remote (US)',
        locationBucket: 'us-remote',
        countryCode: 'US',
        remotePolicy: 'REMOTE_COUNTRY_LOCKED' as const,
        salaryMinUsd: 215000,
        salaryMaxUsd: 255000,
        salaryRawText: '$215,000 - $255,000 USD',
        atsPlatform: 'GREENHOUSE',
        applicationUrl: 'https://boards.greenhouse.io/linear/jobs/staff-ai-platform',
        cleanDescriptionMarkdown:
          'Build Linear agentic triage workflows, TypeScript monorepos, and PostgreSQL vector search. Include the phrase "craft-first" in your cover letter.',
        extractedRequirements: {
          mustHaveSkills: ['TypeScript', 'PostgreSQL', 'Next.js'],
          niceToHaveSkills: ['Cloudflare Workers'],
          minYearsExperience: 6,
          seniorityLevel: 'STAFF',
          domainKeywords: ['Developer Tools', 'AI Agents'],
        },
        extractedQuestions: [
          {
            questionId: 'q_linear_1',
            label: 'Describe a production multi-agent or distributed workflow system you architected.',
            fieldType: 'LONG_TEXT' as const,
            required: true,
          },
        ],
        specialInstructions: [
          {
            instructionType: 'EASTER_EGG_PHRASE' as const,
            exactRequirement: 'Include the phrase "craft-first" in your cover letter',
            sourceQuote: 'Include the phrase "craft-first" in your cover letter.',
          },
        ],
        status: 'TRIAGE_INBOX' as const,
        embedding: buildSeedEmbedding('Linear Staff AI Platform Engineer TypeScript PostgreSQL'),
      },
      {
        id: jobAnthropicId,
        dedupFingerprint: 'seed_fp_anthropic_principal_systems',
        companyName: 'Anthropic',
        normalizedCompanyName: 'anthropic',
        title: 'Principal AI Infrastructure Engineer',
        normalizedTitle: 'principal ai infrastructure engineer',
        locationRaw: 'San Francisco, CA (Hybrid)',
        locationBucket: 'sf-bay-area',
        countryCode: 'US',
        remotePolicy: 'HYBRID' as const,
        salaryMinUsd: 260000,
        salaryMaxUsd: 320000,
        salaryRawText: '$260,000 - $320,000 USD',
        atsPlatform: 'GREENHOUSE',
        applicationUrl: 'https://boards.greenhouse.io/anthropic/jobs/principal-ai-infra',
        cleanDescriptionMarkdown:
          'Architect high-reliability evaluation and inference orchestration systems in TypeScript, PostgreSQL, and custom Kubernetes Operators.',
        extractedRequirements: {
          mustHaveSkills: ['TypeScript', 'PostgreSQL', 'Kubernetes Operator Development'],
          niceToHaveSkills: ['AWS ECS'],
          minYearsExperience: 7,
          seniorityLevel: 'PRINCIPAL',
          domainKeywords: ['AI Safety', 'Inference Infrastructure'],
        },
        extractedQuestions: [],
        specialInstructions: [],
        status: 'PAUSED_NEEDS_INPUT' as const,
        embedding: buildSeedEmbedding('Anthropic Principal AI Infrastructure Engineer'),
      },
      {
        id: jobSupabaseId,
        dedupFingerprint: 'seed_fp_supabase_staff_agentic',
        companyName: 'Supabase',
        normalizedCompanyName: 'supabase',
        title: 'Staff Vector & AI Platform Engineer',
        normalizedTitle: 'staff vector ai platform engineer',
        locationRaw: 'Remote (Global)',
        locationBucket: 'global-remote',
        countryCode: 'US',
        remotePolicy: 'REMOTE_GLOBAL' as const,
        salaryMinUsd: 205000,
        salaryMaxUsd: 240000,
        salaryRawText: '$205,000 - $240,000 USD',
        atsPlatform: 'ASHBY',
        applicationUrl: 'https://jobs.ashbyhq.com/supabase/staff-vector-ai',
        cleanDescriptionMarkdown:
          'Scale pgvector HNSW indexing, hybrid full-text RRF search, and TypeScript developer SDKs.',
        extractedRequirements: {
          mustHaveSkills: ['PostgreSQL', 'TypeScript', 'Next.js'],
          niceToHaveSkills: ['AWS ECS'],
          minYearsExperience: 6,
          seniorityLevel: 'STAFF',
          domainKeywords: ['Databases', 'pgvector', 'Open Source'],
        },
        extractedQuestions: [
          {
            questionId: 'q_supa_1',
            label: 'What is your experience optimizing PostgreSQL or pgvector at scale?',
            fieldType: 'LONG_TEXT' as const,
            required: true,
          },
        ],
        specialInstructions: [],
        status: 'READY_TO_APPLY' as const,
        embedding: buildSeedEmbedding('Supabase Staff Vector AI Platform Engineer pgvector'),
      },
      {
        id: jobRetoolAppliedId,
        dedupFingerprint: 'seed_fp_retool_staff_backend',
        companyName: 'Retool',
        normalizedCompanyName: 'retool',
        title: 'Staff Distributed Systems Engineer',
        normalizedTitle: 'staff distributed systems engineer',
        locationRaw: 'San Francisco, CA',
        locationBucket: 'sf-bay-area',
        countryCode: 'US',
        remotePolicy: 'HYBRID' as const,
        salaryMinUsd: 210000,
        salaryMaxUsd: 250000,
        salaryRawText: '$210,000 - $250,000 USD',
        atsPlatform: 'GREENHOUSE',
        applicationUrl: 'https://boards.greenhouse.io/retool/jobs/staff-distributed',
        cleanDescriptionMarkdown:
          'Lead Retool workflow execution runtime in TypeScript, Node.js, and PostgreSQL.',
        extractedRequirements: {
          mustHaveSkills: ['TypeScript', 'PostgreSQL'],
          niceToHaveSkills: ['Next.js'],
          minYearsExperience: 6,
          seniorityLevel: 'STAFF',
          domainKeywords: ['Workflow Engine', 'Developer Tools'],
        },
        extractedQuestions: [],
        specialInstructions: [],
        status: 'APPLIED' as const,
        embedding: buildSeedEmbedding('Retool Staff Distributed Systems Engineer'),
      },
    ],
    evaluations: [
      {
        jobPostingId: jobLinearId,
        stage1Passed: true,
        stage1KnockoutReasons: [],
        overallScore: 91,
        categoryScores: {
          techStackAlignment: {
            score: 95,
            weight: 0.35,
            rationale: 'Direct production match on TypeScript monorepos, PostgreSQL pgvector, and Next.js.',
          },
          seniorityAndScope: {
            score: 90,
            weight: 0.25,
            rationale: '8 years experience with Staff-level ownership of 1.2M daily workflow runs.',
          },
          domainIndustryFit: {
            score: 88,
            weight: 0.2,
            rationale: 'Strong alignment with developer tooling and agentic workflows.',
          },
          companyStageCulture: {
            score: 88,
            weight: 0.2,
            rationale: 'High-velocity product engineering track record.',
          },
        },
        executiveSummary:
          '• Strong match on TypeScript, PostgreSQL pgvector, and multi-agent orchestration.\n• Easter-egg instruction detected ("craft-first" in cover letter).\n• 1 Moderate Gap (Cloudflare Workers) easily bridged via AWS ECS.',
        flaggedGaps: [
          {
            gapId: 'gap_cf_workers',
            requirementText: 'Experience with Cloudflare Workers edge runtime',
            missingSkillName: 'Cloudflare Workers',
            severity: 'MODERATE' as const,
            adjacentVerifiedSkills: [
              {
                skillId: skillAwsEcsId,
                skillName: 'AWS ECS',
                rationale: 'Transferable container and serverless compute optimization ($240K saved).',
              },
            ],
            resolutionStatus: 'OPEN' as const,
          },
        ],
        hasUnresolvedCriticalGap: false,
        evaluatorModelUsed: 'gemini-3.5-flash',
      },
      {
        jobPostingId: jobAnthropicId,
        stage1Passed: true,
        stage1KnockoutReasons: [],
        overallScore: 83,
        categoryScores: {
          techStackAlignment: {
            score: 80,
            weight: 0.35,
            rationale: 'Strong TypeScript & PostgreSQL match, but missing verified Kubernetes Operator experience.',
          },
          seniorityAndScope: {
            score: 88,
            weight: 0.25,
            rationale: 'Staff-level distributed systems background.',
          },
          domainIndustryFit: {
            score: 85,
            weight: 0.2,
            rationale: 'Direct agentic orchestration background.',
          },
          companyStageCulture: {
            score: 82,
            weight: 0.2,
            rationale: 'High-reliability systems mindset.',
          },
        },
        executiveSummary:
          '• Suspended on 1 CRITICAL skill gap: Kubernetes Operator Development.\n• Resolve inline in Surface B by adding evidence to Master Career Graph or bridging with AWS ECS.',
        flaggedGaps: [
          {
            gapId: 'gap_k8s_operator',
            requirementText: 'Hands-on Kubernetes Operator Development in production',
            missingSkillName: 'Kubernetes Operator Development',
            severity: 'CRITICAL' as const,
            adjacentVerifiedSkills: [
              {
                skillId: skillAwsEcsId,
                skillName: 'AWS ECS',
                rationale: 'Production container orchestration and autoscaling experience.',
              },
            ],
            resolutionStatus: 'OPEN' as const,
          },
        ],
        hasUnresolvedCriticalGap: true,
        evaluatorModelUsed: 'gemini-3.5-pro',
      },
      {
        jobPostingId: jobSupabaseId,
        stage1Passed: true,
        stage1KnockoutReasons: [],
        overallScore: 95,
        categoryScores: {
          techStackAlignment: {
            score: 98,
            weight: 0.35,
            rationale: 'Exact match on PostgreSQL pgvector RRF hybrid search (42% latency cut).',
          },
          seniorityAndScope: {
            score: 94,
            weight: 0.25,
            rationale: 'Proven Staff-level database migration and architecture leadership.',
          },
          domainIndustryFit: {
            score: 94,
            weight: 0.2,
            rationale: 'Deep open-source and developer platform focus.',
          },
          companyStageCulture: {
            score: 92,
            weight: 0.2,
            rationale: 'Remote-first autonomous execution.',
          },
        },
        executiveSummary:
          '• 95/100 Top Match — Tailored Resume & Cover Letter PDFs compiled and ready in Surface C Studio.',
        flaggedGaps: [],
        hasUnresolvedCriticalGap: false,
        evaluatorModelUsed: 'gemini-3.5-flash',
      },
    ],
  };
}

export async function runDatabaseSeed() {
  const data = buildDeterministicSeedDataset();

  await db
    .insert(candidateProfile)
    .values(data.profile)
    .onConflictDoUpdate({
      target: candidateProfile.id,
      set: {
        headline: data.profile.headline,
        hardFilters: data.profile.hardFilters,
        rubricWeights: data.profile.rubricWeights,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(careerSources)
    .values(data.source)
    .onConflictDoNothing();

  for (const exp of data.experiences) {
    await db.insert(careerExperiences).values(exp).onConflictDoNothing();
  }
  for (const b of data.bullets) {
    await db.insert(careerBullets).values(b).onConflictDoNothing();
  }
  for (const p of data.projects) {
    await db.insert(careerProjects).values(p).onConflictDoNothing();
  }
  for (const s of data.stories) {
    await db.insert(careerStories).values(s).onConflictDoNothing();
  }
  for (const sk of data.skills) {
    await db.insert(careerSkills).values(sk).onConflictDoNothing();
  }
  for (const ev of data.evidenceLinks) {
    await db.insert(careerSkillEvidence).values(ev).onConflictDoNothing();
  }
  for (const job of data.jobs) {
    await db.insert(jobPostings).values(job).onConflictDoNothing();
  }
  for (const ev of data.evaluations) {
    await db.insert(fitEvaluations).values(ev).onConflictDoNothing();
  }

  // Insert sample Learned Preference Memory rules
  await db
    .insert(preferenceMemory)
    .values([
      {
        profileId: data.profile.id,
        preferenceType: 'JOB_REJECTION_PATTERN',
        ruleStatement:
          'Penalize roles focused on mobile React Native maintenance or requiring >25% customer-site travel.',
        applicableScopes: ['RUBRIC_SCORING'],
        confidenceWeight: 1.0,
        isActive: true,
        embedding: buildSeedEmbedding('Penalize mobile React Native or >25% travel'),
      },
      {
        profileId: data.profile.id,
        preferenceType: 'PHRASING_REPLACEMENT',
        ruleStatement:
          'Use direct active engineering verbs ("Architected", "Cut", "Optimized") rather than passive phrasing ("Helped build", "Assisted with").',
        applicableScopes: ['RESUME_BULLETS', 'COVER_LETTER'],
        confidenceWeight: 1.0,
        isActive: true,
        embedding: buildSeedEmbedding('Use direct active engineering verbs Architected Cut Optimized'),
      },
    ])
    .onConflictDoNothing();

  return {
    ok: true,
    profileId: data.profile.id,
    seededJobsCount: data.jobs.length,
    seededSkillsCount: data.skills.length,
  };
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed.ts')
) {
  runDatabaseSeed()
    .then((res) => {
      console.log('[Job Copilot DB Seed] Completed:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Job Copilot DB Seed] Error:', err);
      process.exit(1);
    });
}
