import { describe, it, expect, afterEach } from 'vitest';
import type { HardFiltersConfig, RubricWeightsConfig } from '@job-copilot/db';
import {
  evaluateStage1aRawPreFilter,
  evaluateStage1HardFilters,
  computeWeightedOverallScore,
  shouldEscalateToProEvaluator,
  evaluateStage2Rubric,
  setCustomStructuredGenerator,
} from '@job-copilot/agents';
import {
  detectAtsPlatformFromUrl,
  selectPreferredApplyUrl,
  parseAtsJobUrl,
  mapGreenhouseQuestions,
  extractCustomQuestionsFromHtmlDom,
  inspectAndNormalizeJob,
  computeDedupFingerprint,
  mergeJobSources,
  splitAlertEmailDigestIntoJobs,
} from '../index';

afterEach(() => {
  setCustomStructuredGenerator(undefined);
});

const SAMPLE_HARD_FILTERS: HardFiltersConfig = {
  allowedRemotePolicies: ['REMOTE_GLOBAL', 'REMOTE_COUNTRY_LOCKED', 'HYBRID'],
  allowedCountries: ['US', 'CA'],
  allowedLocations: ['San Francisco, CA', 'Seattle, WA'],
  allowedUtcOffsetRange: { min: -8, max: -5 },
  minBaseSalaryUsd: 190000,
  allowUnlistedSalary: true,
  requiresVisaSponsorship: true,
  blacklistedCompanies: ['SpamCorp Inc.', 'ToxicConsulting LLC'],
  blacklistedTitleKeywords: ['unpaid', 'intern', 'commission only', 'clearance required'],
  blacklistedDescriptionKeywords: ['ts/sci polygraph'],
};

const SAMPLE_RUBRIC_WEIGHTS: RubricWeightsConfig = {
  techStackAlignment: 35,
  seniorityAndScope: 25,
  domainIndustryFit: 20,
  companyStageCulture: 20,
};

describe('@job-copilot/jobs & @job-copilot/agents Ingestion & Two-Stage Fit Engine (Milestone 3)', () => {
  it('prioritizes direct ATS links over job aggregators and parses Greenhouse/Lever/Ashby URLs', () => {
    const preferred = selectPreferredApplyUrl(
      [
        { title: 'Apply on LinkedIn', link: 'https://www.linkedin.com/jobs/view/123' },
        { title: 'Apply on Greenhouse', link: 'https://boards.greenhouse.io/linear/jobs/4910283' },
      ],
      'https://google.com/jobs'
    );

    expect(preferred.applicationUrl).toBe('https://boards.greenhouse.io/linear/jobs/4910283');
    expect(preferred.atsPlatformHint).toBe('GREENHOUSE');

    expect(parseAtsJobUrl('https://boards.greenhouse.io/linear/jobs/4910283')).toEqual({
      platform: 'GREENHOUSE',
      companyOrBoardToken: 'linear',
      jobId: '4910283',
    });

    expect(parseAtsJobUrl('https://jobs.lever.co/vercel/a91b2c-3d4e/apply')).toEqual({
      platform: 'LEVER',
      companyOrBoardToken: 'vercel',
      jobId: 'a91b2c-3d4e',
    });

    expect(parseAtsJobUrl('https://jobs.ashbyhq.com/openai/9912-abc/application')).toEqual({
      platform: 'ASHBY',
      companyOrBoardToken: 'openai',
      jobId: '9912-abc',
    });

    expect(detectAtsPlatformFromUrl('https://company.myworkdayjobs.com/en-US/careers')).toBe(
      'WORKDAY'
    );
  });

  it('extracts custom screening questions from Greenhouse JSON and raw HTML forms while filtering identity & EEO fields', () => {
    const ghQuestions = mapGreenhouseQuestions([
      {
        label: 'First Name',
        required: true,
        fields: [{ name: 'first_name', type: 'input_text' }],
      },
      {
        label: 'Gender Identity (Voluntary EEO)',
        required: false,
        fields: [{ name: 'gender', type: 'multi_value_single_select' }],
      },
      {
        label: 'Why do you want to work on our distributed database engine?',
        required: true,
        fields: [{ name: 'question_9912', type: 'textarea' }],
      },
      {
        label: 'Do you have 5+ years of production TypeScript experience?',
        required: true,
        fields: [
          {
            name: 'question_9913',
            type: 'multi_value_single_select',
            values: [{ label: 'Yes' }, { label: 'No' }],
          },
        ],
      },
    ]);

    expect(ghQuestions).toHaveLength(2);
    expect(ghQuestions[0]?.fieldType).toBe('LONG_TEXT');
    expect(ghQuestions[1]?.fieldType).toBe('SINGLE_SELECT');
    expect(ghQuestions[1]?.options).toEqual(['Yes', 'No']);

    const domQuestions = extractCustomQuestionsFromHtmlDom(`
      <form>
        <label for="email">Email Address *</label>
        <input id="email" name="email" type="email" required />

        <label for="q_arch">Describe the most complex architecture you shipped in production *</label>
        <textarea id="q_arch" name="custom_arch" required maxlength="1500"></textarea>

        <label for="q_tz">Preferred Working Timezone</label>
        <select id="q_tz" name="custom_tz">
          <option value="">Select one...</option>
          <option value="pst">Pacific (UTC-8)</option>
          <option value="est">Eastern (UTC-5)</option>
        </select>
      </form>
    `);

    expect(domQuestions).toHaveLength(2);
    expect(domQuestions[0]?.label).toBe(
      'Describe the most complex architecture you shipped in production'
    );
    expect(domQuestions[0]?.maxLength).toBe(1500);
    expect(domQuestions[1]?.options).toEqual(['Pacific (UTC-8)', 'Eastern (UTC-5)']);
  });

  it('computes deterministic SHA-256 deduplication fingerprints across company and title variations', () => {
    const fp1 = computeDedupFingerprint(
      'Linear Inc.',
      'Sr. Full-Stack SWE (Req #4012)',
      'US-Remote'
    );
    const fp2 = computeDedupFingerprint(
      'Linear Technologies',
      'Senior Fullstack Software Engineer',
      'us-remote'
    );

    expect(fp1.normalizedCompanyName).toBe('linear');
    expect(fp1.normalizedTitle).toBe('senior fullstack software engineer');
    expect(fp1.dedupFingerprint).toBe(fp2.dedupFingerprint);

    const sources = mergeJobSources(
      [
        {
          connector: 'SERPAPI_GOOGLE_JOBS',
          sourceUrl: 'https://google.com/jobs/1',
          discoveredAt: '2026-10-26T00:00:00Z',
        },
      ],
      {
        connector: 'ATS_DIRECT_SEARCH',
        sourceUrl: 'https://boards.greenhouse.io/linear/jobs/1',
        discoveredAt: '2026-10-26T01:00:00Z',
      }
    );
    expect(sources).toHaveLength(2);
  });

  it('evaluates Stage 1a raw pre-filter and Stage 1b deterministic hard filters with zero LLM tokens', () => {
    const rawBlocked = evaluateStage1aRawPreFilter(
      {
        companyNameRaw: 'SpamCorp Inc',
        titleRaw: 'Software Engineering Intern',
        locationRaw: 'Remote',
      },
      SAMPLE_HARD_FILTERS
    );
    expect(rawBlocked.passed).toBe(false);
    expect(rawBlocked.knockoutReasons.map((r) => r.rule)).toEqual([
      'BLACKLISTED_COMPANY',
      'BLACKLISTED_TITLE_KEYWORD',
    ]);

    const stage1bFailed = evaluateStage1HardFilters(
      {
        companyName: 'GoodCo',
        normalizedCompanyName: 'goodco',
        title: 'Staff Backend Engineer',
        cleanDescriptionMarkdown: 'Build backend services.',
        remotePolicy: 'ONSITE',
        countryCode: 'US',
        locationRaw: 'Miami, FL',
        allowedUtcOffsetRange: { min: 0, max: 2 }, // CET/UTC+2 -> does not overlap UTC-8..-5
        salaryMinUsd: 140000,
        salaryMaxUsd: 165000, // Below $190k floor
        offersVisaSponsorship: false, // Candidate requires sponsorship
      },
      SAMPLE_HARD_FILTERS
    );

    expect(stage1bFailed.passed).toBe(false);
    expect(stage1bFailed.knockoutReasons.map((r) => r.rule)).toEqual([
      'REMOTE_POLICY_MISMATCH',
      'LOCATION_NOT_ALLOWED',
      'TIMEZONE_OUTSIDE_BOUNDS',
      'SALARY_BELOW_FLOOR',
      'VISA_SPONSORSHIP_UNAVAILABLE',
    ]);

    const stage1bPassed = evaluateStage1HardFilters(
      {
        companyName: 'Linear',
        normalizedCompanyName: 'linear',
        title: 'Staff Full-Stack Engineer',
        cleanDescriptionMarkdown: 'Build product infrastructure in TypeScript.',
        remotePolicy: 'REMOTE_COUNTRY_LOCKED',
        countryCode: 'US',
        locationRaw: 'Remote (US)',
        allowedUtcOffsetRange: { min: -8, max: -5 },
        salaryMinUsd: 205000,
        salaryMaxUsd: 245000,
        offersVisaSponsorship: true,
      },
      SAMPLE_HARD_FILTERS
    );
    expect(stage1bPassed.passed).toBe(true);
    expect(stage1bPassed.knockoutReasons).toHaveLength(0);
  });

  it('computes Stage 2 weighted rubric score, caches static candidate context, and escalates borderline CRITICAL gaps to Pro', async () => {
    const calledTiers: string[] = [];

    setCustomStructuredGenerator(async (options) => {
      calledTiers.push(options.tier);
      expect(options.cachedStaticPrefix).toContain('"headline": "Staff AI Engineer"');

      if (options.tier === 'TIER_2_RUBRIC_DEFAULT') {
        // Returns a borderline score (73) with a CRITICAL gap -> should trigger automatic escalation to TIER_2_RUBRIC_ESCALATED
        return {
          modelUsed: 'gemini-3.5-flash',
          providerUsed: 'google',
          object: {
            categoryScores: {
              techStackAlignment: { score: 78, rationale: 'Good TS match, missing Rust.' },
              seniorityAndScope: { score: 75, rationale: 'Matches Staff scope.' },
              domainIndustryFit: { score: 70, rationale: 'Adjacent domain.' },
              companyStageCulture: { score: 65, rationale: 'Series B fit.' },
            },
            preferencePenaltyPoints: 0,
            executiveSummary: '- Initial Flash assessment.',
            topMatchedBlockIds: {
              experienceIds: ['exp_1'],
              bulletIds: ['b_1'],
              projectIds: [],
              skillIds: ['sk_1'],
            },
            flaggedGaps: [
              {
                gapId: 'gap-rust-ffi',
                requirementText: '3+ years production Rust FFI bindings',
                missingSkillName: 'Rust',
                severity: 'CRITICAL' as const,
                adjacentVerifiedSkills: [
                  {
                    skillId: 'sk_cpp',
                    skillName: 'C++',
                    rationale: 'Systems memory management transfers directly.',
                  },
                ],
              },
            ],
          },
        };
      }

      // Escalated Pro evaluation refines the score and gap analysis
      return {
        modelUsed: 'gemini-3.1-pro',
        providerUsed: 'google',
        object: {
          categoryScores: {
            techStackAlignment: { score: 84, rationale: 'C++ N-API experience bridges Rust FFI.' },
            seniorityAndScope: { score: 86, rationale: 'Strong Staff architecture track record.' },
            domainIndustryFit: { score: 80, rationale: 'Direct AI developer tools fit.' },
            companyStageCulture: { score: 82, rationale: 'Strong autonomous engineering fit.' },
          },
          preferencePenaltyPoints: 0,
          executiveSummary: '- Escalated Pro assessment confirms strong fit with 1 critical gap to confirm.',
          topMatchedBlockIds: {
            experienceIds: ['exp_1'],
            bulletIds: ['b_1'],
            projectIds: [],
            skillIds: ['sk_1'],
          },
          flaggedGaps: [
            {
              gapId: 'gap-rust-ffi',
              requirementText: '3+ years production Rust FFI bindings',
              missingSkillName: 'Rust',
              severity: 'CRITICAL' as const,
              adjacentVerifiedSkills: [
                {
                  skillId: 'sk_cpp',
                  skillName: 'C++',
                  rationale: 'Systems memory management transfers directly.',
                },
              ],
            },
          ],
        },
      };
    });

    const result = await evaluateStage2Rubric({
      candidateStaticContext: {
        headline: 'Staff AI Engineer',
        executiveBio: '8 years building distributed systems.',
        totalYearsExperience: 8,
        targetRoles: ['Staff Engineer'],
        verifiedSkills: [
          {
            id: 'sk_1',
            name: 'TypeScript',
            category: 'LANGUAGE',
            proficiency: 'EXPERT',
            adjacentSkillSlugs: ['javascript'],
          },
        ],
        experiencesOverview: [],
        learnedScoringPreferences: [],
      },
      jobContext: {
        job: {
          id: 'job_1',
          companyName: 'Anthropic',
          title: 'Staff Systems Engineer',
          locationRaw: 'San Francisco, CA',
          remotePolicy: 'HYBRID',
          salaryMinUsd: 240000,
          salaryMaxUsd: 320000,
          cleanDescriptionMarkdown: 'Build high-reliability agent infrastructure.',
          extractedRequirements: {
            mustHaveSkills: ['TypeScript', 'Rust'],
            niceToHaveSkills: ['Kubernetes'],
            domainKeywords: ['ai'],
          },
        },
        topHybridBullets: [],
        topHybridProjects: [],
      },
      rubricWeights: SAMPLE_RUBRIC_WEIGHTS,
    });

    expect(calledTiers).toEqual(['TIER_2_RUBRIC_DEFAULT', 'TIER_2_RUBRIC_ESCALATED']);
    expect(result.escalatedToPro).toBe(true);
    expect(result.evaluatorModelUsed).toBe('gemini-3.1-pro');
    expect(result.overallScore).toBe(83);
    expect(result.hasUnresolvedCriticalGap).toBe(true);
    expect(result.flaggedGaps[0]?.resolutionStatus).toBe('OPEN');
  });

  it('splits Gmail alert digest emails and merges pre-extracted form questions during Tier 1 normalization', async () => {
    setCustomStructuredGenerator(async (options) => {
      if (options.userPrompt.includes('Subject: Daily Job Alert')) {
        return {
          modelUsed: 'gemini-3.1-flash-lite',
          providerUsed: 'google',
          object: {
            extractedJobs: [
              {
                companyName: 'Vercel',
                jobTitle: 'Staff Infrastructure Engineer',
                locationHint: 'Remote (US)',
                rawApplyUrl: 'https://jobs.lever.co/vercel/112233',
                summarySnippet: 'Scale edge network.',
              },
            ],
          },
        };
      }

      return {
        modelUsed: 'gemini-3.1-flash-lite',
        providerUsed: 'google',
        object: {
          companyName: 'Vercel',
          title: 'Staff Infrastructure Engineer',
          locationRaw: 'Remote (US)',
          locationBucket: 'us-remote',
          countryCode: 'US',
          remotePolicy: 'REMOTE_COUNTRY_LOCKED',
          allowedUtcOffsetRange: null,
          salaryMinUsd: 215000,
          salaryMaxUsd: 260000,
          offersVisaSponsorship: true,
          cleanDescriptionMarkdown: 'Scale edge network. Include the phrase "edge-fast" in Q1.',
          extractedRequirements: {
            mustHaveSkills: ['TypeScript', 'Go'],
            niceToHaveSkills: ['Rust'],
            minYearsExperience: 6,
            seniorityLevel: 'STAFF_PRINCIPAL',
            domainKeywords: ['edge-cloud'],
          },
          extractedQuestions: [],
          requiredAttachments: {
            resume: true,
            coverLetter: 'OPTIONAL',
            portfolioUrl: false,
            otherFiles: [],
          },
          specialInstructions: [
            {
              instructionType: 'EASTER_EGG_PHRASE',
              exactRequirement: 'Include the phrase "edge-fast" in Q1',
              sourceQuote: 'Include the phrase "edge-fast" in Q1.',
            },
          ],
        },
      };
    });

    const digestJobs = await splitAlertEmailDigestIntoJobs({
      emailSubject: 'Daily Job Alert',
      emailHtmlBody: '<p>New role: <a href="https://jobs.lever.co/vercel/112233">Staff Infra @ Vercel</a></p>',
    });
    expect(digestJobs).toHaveLength(1);
    expect(digestJobs[0]?.atsPlatformHint).toBe('LEVER');

    const inspected = await inspectAndNormalizeJob(
      {
        ...digestJobs[0]!,
        descriptionHtmlOrText: `
          <p>Scale edge network. Include the phrase "edge-fast" in Q1.</p>
          <form>
            <label for="q_edge">What is the highest RPS service you have operated?</label>
            <textarea id="q_edge" name="q_edge" required></textarea>
          </form>
        `,
      },
      { fetchRemoteFormIfMissing: false }
    );

    expect(inspected.normalized.extractedQuestions).toHaveLength(1);
    expect(inspected.normalized.extractedQuestions[0]?.label).toBe(
      'What is the highest RPS service you have operated?'
    );
    expect(inspected.normalized.specialInstructions[0]?.exactRequirement).toBe(
      'Include the phrase "edge-fast" in Q1'
    );
  });
});
