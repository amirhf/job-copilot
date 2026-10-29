import { describe, it, expect, afterEach } from 'vitest';
import {
  buildDeterministicSeedDataset,
  buildSeedEmbedding,
  EMBEDDING_DIMENSIONS,
} from '@job-copilot/db';
import {
  enforceEvidenceIntegrity,
  evaluateStage1aRawPreFilter,
  evaluateStage1HardFilters,
  runGenerateMaterialsPipeline,
  getBufferedStreamEvents,
  clearInMemoryStreamChannel,
  setCustomStructuredGenerator,
  recordJobRejectionMemory,
  recordStudioPhrasingMemory,
} from '../index';

const E2E_CHANNEL = 'e2e_stream_channel_linear';

afterEach(() => {
  setCustomStructuredGenerator(undefined);
  clearInMemoryStreamChannel(E2E_CHANNEL);
});

describe('End-to-End 5-Session Pipeline Integration & Seed Verification (Milestone 7)', () => {
  it('validates the deterministic seed dataset (768-dim vectors, evidence links, and 4 pipeline surface states)', () => {
    const seed = buildDeterministicSeedDataset();

    expect(seed.profile.fullName).toBe('Alex Rivera');
    expect(seed.experiences[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(seed.bullets[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(seed.skills[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);

    // Every verified skill in seed.skills has at least 1 evidence link in seed.evidenceLinks
    const verifiedSkills = seed.skills.filter((s) => s.isUserVerified);
    for (const sk of verifiedSkills) {
      const hasEvidence = seed.evidenceLinks.some((ev) => ev.skillId === sk.id);
      expect(hasEvidence).toBe(true);
    }

    // Verify all pipeline surface states are represented in seed.jobs
    const statuses = seed.jobs.map((j) => j.status);
    expect(statuses).toContain('TRIAGE_INBOX');
    expect(statuses).toContain('PAUSED_NEEDS_INPUT');
    expect(statuses).toContain('READY_TO_APPLY');
    expect(statuses).toContain('APPLIED');
  });

  it('executes the end-to-end journey: Career Graph Integrity -> Stage 1a/1b Filter -> Suspend on Gap -> Resume & Compile Typst PDF -> Preference Memory Learning', async () => {
    const seed = buildDeterministicSeedDataset();

    // 1. Session 1: Enforce Zero-Hallucination Evidence Integrity
    const integrityResult = enforceEvidenceIntegrity({
      experiences: [
        {
          tempExperienceId: 'exp_1',
          companyName: 'Acme AI Cloud',
          normalizedCompanyName: 'acme ai cloud',
          jobTitle: 'Staff AI Platform Engineer',
          employmentType: 'FULL_TIME',
          location: 'San Francisco, CA',
          remotePolicy: 'HYBRID',
          startDate: '2022-03-01',
          endDate: null,
          isCurrent: true,
          companyStageAndContext: 'Series B',
          roleOverview: 'Lead multi-agent orchestration',
          domainTags: ['AI'],
          primaryTechStack: ['TypeScript', 'PostgreSQL'],
          bullets: [
            {
              tempBulletId: 'b_1',
              bulletText: 'Cut p99 API latency by 42% using PostgreSQL pgvector.',
              actionVerb: 'Cut',
              situationAndTask: 'High search latency',
              technicalApproach: 'pgvector HNSW + RRF',
              quantifiedMetrics: [
                { metric: 'latency cut', value: '42%', isExactFromSource: true },
              ],
              skillTags: ['TypeScript', 'PostgreSQL'],
              impactScore: 95,
            },
          ],
        },
      ],
      projects: [],
      stories: [],
      skills: [
        {
          name: 'PostgreSQL',
          normalizedSlug: 'postgresql',
          aliases: ['pgvector'],
          category: 'DATABASE_STORAGE',
          proficiency: 'EXPERT',
          adjacentSkillSlugs: [],
          evidenceLinks: [
            {
              sourceBlockTempId: 'b_1',
              verbatimEvidenceExcerpt: 'Cut p99 API latency by 42% using PostgreSQL pgvector.',
            },
          ],
        },
        {
          name: 'Elixir',
          normalizedSlug: 'elixir',
          aliases: [],
          category: 'LANGUAGE',
          proficiency: 'FAMILIAR',
          adjacentSkillSlugs: [],
          evidenceLinks: [
            {
              sourceBlockTempId: 'non_existent_block',
              verbatimEvidenceExcerpt: 'Listed in skills footer without experience',
            },
          ],
        },
      ],
      unverifiedSkillMentions: [],
    });

    expect(integrityResult.sanitized.skills).toHaveLength(1);
    expect(integrityResult.sanitized.skills[0]?.name).toBe('PostgreSQL');
    expect(integrityResult.reclassifiedOrphanSkills).toEqual(['Elixir']);
    expect(integrityResult.sanitized.unverifiedSkillMentions).toContain('Elixir');

    // 2. Session 2: Stage 1a Raw Pre-Filter & Stage 1b Hard Filter
    const blockedRaw = evaluateStage1aRawPreFilter(
      {
        companyNameRaw: 'Stealth Bodyshop Inc',
        titleRaw: 'Junior WordPress Developer',
        locationRaw: 'Remote',
        descriptionHtmlOrText: 'Build WordPress themes',
      },
      seed.profile.hardFilters
    );
    expect(blockedRaw.passed).toBe(false);

    const passedStage1b = evaluateStage1HardFilters(
      {
        companyName: 'Linear',
        normalizedCompanyName: 'linear',
        title: 'Staff AI Platform Engineer',
        countryCode: 'US',
        locationRaw: 'San Francisco, CA',
        remotePolicy: 'REMOTE_COUNTRY_LOCKED',
        allowedUtcOffsetRange: { min: -8, max: -5 },
        salaryMinUsd: 215000,
        salaryMaxUsd: 255000,
        offersVisaSponsorship: true,
        cleanDescriptionMarkdown: 'Build agentic workflows in TypeScript and PostgreSQL.',
      },
      seed.profile.hardFilters
    );
    expect(passedStage1b.passed).toBe(true);

    // 3. Session 3: Watchable Synthesis with Critical Skill Gap Suspend -> Resume -> Native Typst PDF Compilation
    let llmStep = 0;
    setCustomStructuredGenerator(async () => {
      llmStep++;
      if (llmStep === 1 || llmStep === 2) {
        return {
          modelUsed: 'gemini-3.5-flash',
          providerUsed: 'google',
          object: {
            targetHeadline: 'Staff AI Platform Engineer',
            prioritizedAtsKeywords: ['TypeScript', 'PostgreSQL', 'Next.js'],
            seniorityTone: 'STAFF_ARCHITECT',
            coreProblemsToEmphasize: ['Multi-agent orchestration'],
            mandatorySpecialInstructions: ['craft-first'],
          },
        };
      }
      if (llmStep === 3) {
        return {
          modelUsed: 'claude-sonnet-4-6',
          providerUsed: 'anthropic',
          object: {
            targetHeadline: 'Staff AI Platform Engineer',
            executiveSummary:
              'Staff Engineer with 8+ years architecting TypeScript monorepos and PostgreSQL pgvector systems.',
            selectedExperiences: [
              {
                experienceId: seed.experiences[0]!.id,
                companyName: 'Acme AI Cloud',
                jobTitle: 'Staff AI Platform Engineer',
                dateRangeText: '2022 – Present',
                locationText: 'San Francisco, CA',
                tailoredBullets: [
                  {
                    sourceBulletId: seed.bullets[0]!.id,
                    originalText: seed.bullets[0]!.bulletText,
                    tailoredText:
                      'Architected multi-agent workflow engine in TypeScript handling 1.2M daily runs with 99.98% durability.',
                  },
                  {
                    sourceBulletId: seed.bullets[1]!.id,
                    originalText: seed.bullets[1]!.bulletText,
                    tailoredText:
                      'Cut p99 API latency by 42% across 12 services using PostgreSQL pgvector and Next.js.',
                  },
                ],
              },
            ],
            selectedProjects: [],
            categorizedSkills: [
              {
                categoryLabel: 'Core Stack',
                skills: ['TypeScript', 'PostgreSQL', 'Next.js', 'AWS ECS'],
              },
            ],
          },
        };
      }
      return {
        modelUsed: 'claude-sonnet-4-6',
        providerUsed: 'anthropic',
        object: {
          coverLetterMarkdown:
            'Dear Linear Team,\n\nI am excited to bring a craft-first engineering approach to Linear.',
          screeningAnswers: [
            {
              questionId: 'q_linear_1',
              questionLabel:
                'Describe a production multi-agent or distributed workflow system you architected.',
              fieldType: 'LONG_TEXT',
              draftedAnswer:
                'I architected a TypeScript multi-agent workflow engine handling 1.2M daily runs and cut p99 latency by 42%.',
              citedCareerBlockIds: [seed.bullets[0]!.id, seed.bullets[1]!.id],
            },
          ],
        },
      };
    });

    const baseCtx = {
      jobPostingId: seed.jobs[0]!.id,
      profileId: seed.profile.id,
      packageId: 'pkg_e2e_1',
      streamChannelId: E2E_CHANNEL,
      candidate: {
        fullName: seed.profile.fullName,
        email: seed.profile.email,
        phone: seed.profile.phone,
        locationCity: seed.profile.locationCity,
        linkedinUrl: seed.profile.links.linkedinUrl,
        githubUrl: seed.profile.links.githubUrl,
        headline: seed.profile.headline,
        executiveBio: seed.profile.executiveBio,
      },
      job: {
        id: seed.jobs[0]!.id,
        companyName: seed.jobs[0]!.companyName,
        title: seed.jobs[0]!.title,
        locationRaw: seed.jobs[0]!.locationRaw,
        cleanDescriptionMarkdown: seed.jobs[0]!.cleanDescriptionMarkdown,
        extractedRequirements: seed.jobs[0]!.extractedRequirements,
        extractedQuestions: seed.jobs[0]!.extractedQuestions,
        specialInstructions: seed.jobs[0]!.specialInstructions,
      },
      flaggedGaps: [
        {
          gapId: 'gap_k8s_critical',
          requirementText: 'Production Kubernetes Operator experience',
          missingSkillName: 'Kubernetes',
          severity: 'CRITICAL' as const,
          adjacentVerifiedSkills: [
            {
              skillId: seed.skills[3]!.id,
              skillName: 'AWS ECS',
              rationale: 'Container orchestration transfers directly',
            },
          ],
          resolutionStatus: 'OPEN' as const,
        },
      ],
      experiences: [
        {
          id: seed.experiences[0]!.id,
          companyName: seed.experiences[0]!.companyName,
          jobTitle: seed.experiences[0]!.jobTitle,
          startDate: seed.experiences[0]!.startDate,
          endDate: seed.experiences[0]!.endDate,
          location: seed.experiences[0]!.location,
          bullets: seed.bullets.slice(0, 2).map((b) => ({
            id: b.id,
            bulletText: b.bulletText,
            skillTags: b.skillTags,
          })),
        },
      ],
      projects: [],
      stories: [],
      verifiedSkills: [
        { id: seed.skills[0]!.id, name: 'TypeScript', category: 'LANGUAGE' },
        { id: seed.skills[1]!.id, name: 'PostgreSQL', category: 'DATABASE_STORAGE' },
        { id: seed.skills[2]!.id, name: 'Next.js', category: 'FRAMEWORK_LIBRARY' },
      ],
      writingStyleRules: ['Use direct active engineering verbs.'],
    };

    // First run suspends on CRITICAL gap
    const suspended = await runGenerateMaterialsPipeline(baseCtx);
    expect(suspended.status).toBe('SUSPENDED_ON_GAP');

    // Resume with BRIDGED resolution -> compiles real Typst PDF and passes Zero-Hallucination & Easter-Egg audits
    const resumed = await runGenerateMaterialsPipeline({
      ...baseCtx,
      gapResolutions: [
        {
          gapId: 'gap_k8s_critical',
          action: 'BRIDGED',
          bridgeSkillName: 'AWS ECS',
        },
      ],
    });

    expect(resumed.status).toBe('COMPLETED');
    expect(resumed.pdfAudit?.zeroHallucinationAuditPassed).toBe(true);
    expect(resumed.pdfAudit?.specialInstructionsVerified).toBe(true);
    expect(resumed.pdfAudit?.atsKeywordCoveragePercent).toBeGreaterThanOrEqual(75);
    expect(
      Buffer.from(resumed.compiledResumePdfBase64!, 'base64')
        .subarray(0, 5)
        .toString('utf8')
    ).toBe('%PDF-');

    // 4. Session 4 & 5: Resumable SSE Cursor Replay & Preference Memory Reinforcement
    const eventsAfterSeq3 = await getBufferedStreamEvents(E2E_CHANNEL, 3);
    expect(eventsAfterSeq3.every((e) => e.seq > 3)).toBe(true);

    const existingMemEmbedding = buildSeedEmbedding(
      'Penalize roles matching user rejection note (Wrong Core Stack): Skip mobile React Native roles'
    );
    const memRule1 = await recordJobRejectionMemory({
      profileId: seed.profile.id,
      jobPostingId: seed.jobs[0]!.id,
      companyName: 'MobileApp Co',
      jobTitle: 'React Native Lead',
      rejectionReasonCategory: 'Wrong Core Stack',
      userFeedbackNote: 'Skip mobile React Native roles',
      existingRules: [],
    });
    expect(memRule1.action).toBe('INSERTED');

    const memRule2 = await recordStudioPhrasingMemory({
      profileId: seed.profile.id,
      jobPostingId: seed.jobs[0]!.id,
      originalTextSnippet: 'Helped build a distributed queue',
      userEditedTextSnippet: 'Architected a distributed queue',
      defaultScope: 'RESUME_BULLETS',
      existingRules: [],
    });
    expect(memRule2.action).toBe('INSERTED');
    expect(existingMemEmbedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });
});
