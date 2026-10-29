import { describe, it, expect, afterEach } from 'vitest';
import {
  runGenerateMaterialsPipeline,
  getBufferedStreamEvents,
  clearInMemoryStreamChannel,
  setCustomStructuredGenerator,
  type GenerateMaterialsContextData,
} from '../index';

const STREAM_CHANNEL = 'test_channel_job_99';

afterEach(() => {
  setCustomStructuredGenerator(undefined);
  clearInMemoryStreamChannel(STREAM_CHANNEL);
});

function createSampleContext(
  overrides?: Partial<GenerateMaterialsContextData>
): GenerateMaterialsContextData {
  return {
    jobPostingId: '00000000-0000-0000-0000-000000000099',
    profileId: '00000000-0000-0000-0000-000000000001',
    packageId: '00000000-0000-0000-0000-000000000055',
    streamChannelId: STREAM_CHANNEL,
    synthesisModelTier: 'TIER_3_SYNTHESIS_DEFAULT',
    candidate: {
      fullName: 'Alex Rivera',
      email: 'alex@example.com',
      phone: '+1-555-0199',
      locationCity: 'San Francisco, CA',
      linkedinUrl: 'https://linkedin.com/in/alexrivera',
      githubUrl: 'https://github.com/alexrivera',
      headline: 'Staff AI & Distributed Systems Engineer',
      executiveBio: '8+ years building multi-agent orchestration and TypeScript monorepos.',
    },
    job: {
      id: '00000000-0000-0000-0000-000000000099',
      companyName: 'Linear',
      title: 'Staff AI Platform Engineer',
      locationRaw: 'Remote (US)',
      cleanDescriptionMarkdown:
        'Build high-speed agentic workflows in TypeScript and PostgreSQL. Include the phrase "craft-matters" in your cover letter.',
      extractedRequirements: {
        mustHaveSkills: ['TypeScript', 'PostgreSQL', 'pgvector'],
        niceToHaveSkills: ['Rust'],
        domainKeywords: ['developer-tools'],
      },
      extractedQuestions: [
        {
          questionId: 'q_scale',
          label: 'Describe a distributed system you scaled in production.',
          fieldType: 'LONG_TEXT',
          required: true,
        },
      ],
      specialInstructions: [
        {
          instructionType: 'EASTER_EGG_PHRASE',
          exactRequirement: 'Include the phrase "craft-matters" in your cover letter',
          sourceQuote: 'Include the phrase "craft-matters" in your cover letter.',
        },
      ],
    },
    flaggedGaps: [
      {
        gapId: 'gap-rust-runtime',
        requirementText: 'Experience with Rust native bindings',
        missingSkillName: 'Rust',
        severity: 'CRITICAL',
        adjacentVerifiedSkills: [
          {
            skillId: 'sk_cpp',
            skillName: 'C++',
            rationale: 'Systems memory management transfers directly.',
          },
        ],
        resolutionStatus: 'OPEN',
      },
    ],
    experiences: [
      {
        id: 'exp_1',
        companyName: 'Acme Systems',
        jobTitle: 'Staff Engineer',
        startDate: '2022-01-01',
        endDate: null,
        location: 'San Francisco, CA',
        bullets: [
          {
            id: 'b_1',
            bulletText: 'Cut p99 query latency by 42% using PostgreSQL pgvector HNSW indexes.',
            skillTags: ['TypeScript', 'PostgreSQL', 'pgvector'],
          },
        ],
      },
    ],
    projects: [
      {
        id: 'proj_1',
        projectName: 'Mastra Orchestrator',
        tagline: 'Durable TypeScript workflow engine',
        problemStatement: 'Long-running agent tasks lacked suspend/resume.',
        architectureAndStack: 'TypeScript, PostgreSQL, SSE',
        highlightBullets: ['Built sub-50ms resumable SSE event streaming'],
        techStackTags: ['TypeScript', 'PostgreSQL'],
      },
    ],
    stories: [
      {
        id: 'story_1',
        title: 'Scaling multi-tenant event ingestion',
        situation: 'Database connection pool saturated at peak load.',
        task: 'Redesign ingestion funnel without downtime.',
        action: 'Implemented pre-deduplication and batched vector indexing.',
        result: 'Reduced DB load by 65% and eliminated p99 spikes.',
      },
    ],
    verifiedSkills: [
      { id: 'sk_ts', name: 'TypeScript', category: 'LANGUAGE' },
      { id: 'sk_pg', name: 'PostgreSQL', category: 'DATABASE_STORAGE' },
      { id: 'sk_pgv', name: 'pgvector', category: 'AI_ML_DATA' },
    ],
    writingStyleRules: ['Prefer direct active verbs like Architected, Built, and Cut.'],
    ...overrides,
  };
}

describe('@job-copilot/agents 6-Step Watchable Material Generation Workflow (Milestone 4)', () => {
  it('suspends at Step 3 (checkCriticalGaps) when an unresolved CRITICAL gap exists and emits WORKFLOW_SUSPENDED_ON_GAP', async () => {
    setCustomStructuredGenerator(async () => ({
      modelUsed: 'gemini-3.5-flash',
      providerUsed: 'google',
      object: {
        targetHeadline: 'Staff AI Platform Engineer',
        prioritizedAtsKeywords: ['TypeScript', 'PostgreSQL', 'pgvector'],
        seniorityTone: 'STAFF_ARCHITECT',
        coreProblemsToEmphasize: ['Multi-agent orchestration'],
        mandatorySpecialInstructions: ['craft-matters'],
      },
    }));

    const result = await runGenerateMaterialsPipeline(createSampleContext());

    expect(result.status).toBe('SUSPENDED_ON_GAP');
    expect(result.unresolvedCriticalGaps).toHaveLength(1);
    expect(result.unresolvedCriticalGaps?.[0]?.gapId).toBe('gap-rust-runtime');

    const streamEvents = await getBufferedStreamEvents(STREAM_CHANNEL, 0);
    expect(streamEvents.map((e) => e.type)).toEqual([
      'STEP_STARTED', // ANALYZING_REQUIREMENTS
      'STEP_STARTED', // SELECTING_CAREER_BLOCKS
      'STATE_SNAPSHOT',
      'STEP_STARTED', // CHECKING_CRITICAL_GAPS
      'WORKFLOW_SUSPENDED_ON_GAP',
      'RUN_FINISHED', // PAUSED_NEEDS_INPUT
    ]);
  });

  it('completes all 6 steps when CRITICAL gap is resolved, streams Typst deltas, and passes Zero-Hallucination & Easter-Egg audits', async () => {
    let callIdx = 0;
    setCustomStructuredGenerator(async () => {
      callIdx++;
      if (callIdx === 1) {
        // Step 1: TargetRoleBlueprintSchema
        return {
          modelUsed: 'gemini-3.5-flash',
          providerUsed: 'google',
          object: {
            targetHeadline: 'Staff AI Platform Engineer',
            prioritizedAtsKeywords: ['TypeScript', 'PostgreSQL', 'pgvector'],
            seniorityTone: 'STAFF_ARCHITECT',
            coreProblemsToEmphasize: ['Agentic workflows'],
            mandatorySpecialInstructions: ['Include "craft-matters"'],
          },
        };
      }
      if (callIdx === 2) {
        // Step 4: SynthesizedResumeSchema
        return {
          modelUsed: 'claude-sonnet-4-6',
          providerUsed: 'anthropic',
          object: {
            targetHeadline: 'Staff AI Platform Engineer',
            executiveSummary:
              'Staff Engineer specializing in TypeScript monorepos, PostgreSQL, and pgvector hybrid search.',
            selectedExperiences: [
              {
                experienceId: 'exp_1',
                companyName: 'Acme Systems',
                jobTitle: 'Staff Engineer',
                dateRangeText: '2022 – Present',
                locationText: 'San Francisco, CA',
                tailoredBullets: [
                  {
                    sourceBulletId: 'b_1',
                    originalText:
                      'Cut p99 query latency by 42% using PostgreSQL pgvector HNSW indexes.',
                    tailoredText:
                      'Cut p99 query latency by 42% using PostgreSQL and pgvector HNSW indexes in a TypeScript platform.',
                    bridgedSkillNote: 'Emphasized systems optimization transferable to Rust.',
                  },
                ],
              },
            ],
            selectedProjects: [
              {
                projectId: 'proj_1',
                projectName: 'Mastra Orchestrator',
                tailoredSummary: 'Durable TypeScript workflow engine',
                tailoredHighlights: ['Built resumable SSE streaming for multi-agent pipelines'],
              },
            ],
            categorizedSkills: [
              {
                categoryLabel: 'Core Stack',
                skills: ['TypeScript', 'PostgreSQL', 'pgvector'],
              },
            ],
          },
        };
      }

      // Step 5: SynthesizedCoverLetterAndQaSchema
      return {
        modelUsed: 'claude-sonnet-4-6',
        providerUsed: 'anthropic',
        object: {
          coverLetterMarkdown:
            'Dear Linear Team,\n\nI believe craft-matters when building low-latency developer tools with TypeScript and PostgreSQL.',
          screeningAnswers: [
            {
              questionId: 'q_scale',
              questionLabel: 'Describe a distributed system you scaled in production.',
              fieldType: 'LONG_TEXT',
              draftedAnswer:
                'At Acme Systems, I redesigned our multi-tenant ingestion funnel and cut p99 query latency by 42% using pgvector.',
              citedCareerBlockIds: ['exp_1', 'b_1', 'story_1'],
            },
          ],
        },
      };
    });

    const completed = await runGenerateMaterialsPipeline(
      createSampleContext({
        gapResolutions: [
          {
            gapId: 'gap-rust-runtime',
            action: 'BRIDGED',
            bridgeSkillName: 'C++',
            userGuidanceNote: 'Emphasize systems memory management foundation.',
          },
        ],
      })
    );

    expect(completed.status).toBe('COMPLETED');
    expect(completed.synthesisModelUsed).toBe('claude-sonnet-4-6');
    expect(completed.pdfAudit?.zeroHallucinationAuditPassed).toBe(true);
    expect(completed.pdfAudit?.specialInstructionsVerified).toBe(true);
    expect(completed.pdfAudit?.pageCount).toBe(1);
    expect(completed.compiledResumePdfBase64).toBeTruthy();

    // Verify resumable SSE replay from sequence 4 onwards
    const allEvents = await getBufferedStreamEvents(STREAM_CHANNEL, 0);
    const replayedTail = await getBufferedStreamEvents(STREAM_CHANNEL, 4);
    expect(replayedTail.length).toBe(allEvents.length - 4);
    expect(allEvents.some((e) => e.type === 'TYPST_SOURCE_UPDATED')).toBe(true);
    expect(allEvents.some((e) => e.type === 'QA_DRAFTED')).toBe(true);
    expect(allEvents.at(-1)?.type).toBe('RUN_FINISHED');
  });
});
