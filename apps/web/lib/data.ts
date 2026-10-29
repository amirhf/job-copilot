import {
  db,
  eq,
  inArray,
  desc,
  candidateProfile,
  jobPostings,
  applicationPackages,
  careerExperiences,
  careerProjects,
  careerStories,
  careerSkills,
  careerSources,
  preferenceMemory,
  type HardFiltersConfig,
  type RubricWeightsConfig,
  type FlaggedSkillGap,
  type SpecialPostingInstruction,
  type ExtractedApplicationQuestion,
  type TailoredResumePayload,
  type AnsweredScreeningQuestion,
  type PdfCompilationAudit,
  type QuantifiedMetric,
} from '@job-copilot/db';

export interface PipelineStageCounts {
  inbox: number;
  approved: number;
  ready: number;
  applied: number;
}

export interface JobWithEvaluationAndPackage {
  id: string;
  companyName: string;
  title: string;
  locationRaw: string;
  remotePolicy:
    | 'REMOTE_GLOBAL'
    | 'REMOTE_COUNTRY_LOCKED'
    | 'REMOTE_TIMEZONE_LOCKED'
    | 'HYBRID'
    | 'ONSITE'
    | 'UNKNOWN';
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  salaryRawText: string | null;
  atsPlatform: string | null;
  applicationUrl: string;
  cleanDescriptionMarkdown: string;
  status:
    | 'INGESTED'
    | 'FILTERED_OUT'
    | 'TRIAGE_INBOX'
    | 'APPROVED'
    | 'GENERATING'
    | 'PAUSED_NEEDS_INPUT'
    | 'READY_TO_APPLY'
    | 'APPLYING'
    | 'APPLIED'
    | 'REJECTED'
    | 'ARCHIVED';
  extractedRequirements: {
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
    minYearsExperience?: number | null;
    seniorityLevel?: string;
    domainKeywords: string[];
  };
  extractedQuestions: ExtractedApplicationQuestion[];
  specialInstructions: SpecialPostingInstruction[];
  rejectionReasonCategory: string | null;
  rejectionUserNotes: string | null;
  ingestedAt: string;
  evaluation: {
    stage1Passed: boolean;
    overallScore: number | null;
    categoryScores: {
      techStackAlignment: { score: number; weight: number; rationale: string };
      seniorityAndScope: { score: number; weight: number; rationale: string };
      domainIndustryFit: { score: number; weight: number; rationale: string };
      companyStageCulture: { score: number; weight: number; rationale: string };
    } | null;
    executiveSummary: string | null;
    flaggedGaps: FlaggedSkillGap[];
    hasUnresolvedCriticalGap: boolean;
    evaluatorModelUsed: string | null;
  } | null;
  latestPackage: {
    id: string;
    version: number;
    isImmutableSnapshot: boolean;
    currentStep: string;
    streamChannelId: string | null;
    tailoredResumeData: TailoredResumePayload | null;
    resumeTypstSource: string | null;
    coverLetterMarkdown: string | null;
    coverLetterTypstSource: string | null;
    screeningQuestionAnswers: AnsweredScreeningQuestion[];
    pdfAudit: PdfCompilationAudit | null;
    synthesisModelUsed: string;
    applyMode: 'STAGEHAND_HEADED' | 'COPY_PASTE_KIT' | 'MANUAL_DIRECT' | null;
    postApplyStage:
      | 'APPLIED_AWAITING_RESPONSE'
      | 'RECRUITER_SCREEN'
      | 'TECHNICAL_INTERVIEW'
      | 'FINAL_ROUND'
      | 'OFFER_RECEIVED'
      | 'POST_APPLY_REJECTED'
      | 'WITHDRAWN'
      | null;
    stagehandSessionLog: {
      filledFieldsCount: number;
      ambiguousFieldsFlagged: string[];
      haltedAtSubmitAt?: string;
    } | null;
    submittedAt: string | null;
  } | null;
}

const DEFAULT_HARD_FILTERS: HardFiltersConfig = {
  allowedRemotePolicies: [
    'REMOTE_GLOBAL',
    'REMOTE_COUNTRY_LOCKED',
    'REMOTE_TIMEZONE_LOCKED',
    'HYBRID',
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
};

const DEFAULT_RUBRIC_WEIGHTS: RubricWeightsConfig = {
  techStackAlignment: 0.35,
  seniorityAndScope: 0.25,
  domainIndustryFit: 0.2,
  companyStageCulture: 0.2,
};

export async function getOrEnsureCandidateProfile() {
  try {
    const existing = await db.query.candidateProfile.findFirst();
    if (existing) return existing;

    const [inserted] = await db
      .insert(candidateProfile)
      .values({
        fullName: 'Alex Rivera',
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
        headline: 'Staff AI & Distributed Systems Engineer',
        executiveBio:
          'Staff Engineer with 8+ years architecting TypeScript monorepos, multi-agent LLM orchestration engines, and high-throughput PostgreSQL/pgvector data systems.',
        totalYearsExperience: 8,
        targetRoles: [
          'Staff Software Engineer',
          'Staff AI Engineer',
          'Principal Systems Engineer',
        ],
        workAuthorization: {
          authorizedCountries: ['US'],
          requiresSponsorship: false,
          visaStatusNote: 'US Citizen',
        },
        hardFilters: DEFAULT_HARD_FILTERS,
        rubricWeights: DEFAULT_RUBRIC_WEIGHTS,
      })
      .returning();

    return inserted!;
  } catch {
    return {
      id: '00000000-0000-4000-8000-000000000001',
      fullName: 'Alex Rivera',
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
      headline: 'Staff AI & Distributed Systems Engineer',
      executiveBio:
        'Staff Engineer with 8+ years architecting TypeScript monorepos, multi-agent LLM orchestration engines, and high-throughput PostgreSQL/pgvector data systems.',
      totalYearsExperience: 8,
      targetRoles: [
        'Staff Software Engineer',
        'Staff AI Engineer',
        'Principal Systems Engineer',
      ],
      workAuthorization: {
        authorizedCountries: ['US'],
        requiresSponsorship: false,
        visaStatusNote: 'US Citizen',
      },
      hardFilters: DEFAULT_HARD_FILTERS,
      rubricWeights: DEFAULT_RUBRIC_WEIGHTS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export async function getPipelineCounts(): Promise<PipelineStageCounts> {
  try {
    const allJobs = await db
      .select({ status: jobPostings.status })
      .from(jobPostings);

    const counts: PipelineStageCounts = {
      inbox: 0,
      approved: 0,
      ready: 0,
      applied: 0,
    };

    for (const row of allJobs) {
      if (row.status === 'TRIAGE_INBOX') counts.inbox++;
      else if (
        row.status === 'APPROVED' ||
        row.status === 'GENERATING' ||
        row.status === 'PAUSED_NEEDS_INPUT'
      ) {
        counts.approved++;
      } else if (row.status === 'READY_TO_APPLY' || row.status === 'APPLYING') {
        counts.ready++;
      } else if (
        row.status === 'APPLIED' ||
        row.status === 'REJECTED' ||
        row.status === 'FILTERED_OUT'
      ) {
        counts.applied++;
      }
    }
    return counts;
  } catch {
    return { inbox: 0, approved: 0, ready: 0, applied: 0 };
  }
}

export async function getJobsByStatuses(
  statuses: Array<JobWithEvaluationAndPackage['status']>
): Promise<JobWithEvaluationAndPackage[]> {
  try {
    const rows = await db.query.jobPostings.findMany({
      where: inArray(jobPostings.status, statuses),
      with: {
        fitEvaluation: true,
        applicationPackages: {
          orderBy: [desc(applicationPackages.version)],
          limit: 1,
        },
      },
      orderBy: [desc(jobPostings.ingestedAt)],
    });

    const mapped: JobWithEvaluationAndPackage[] = rows.map((row) => {
      const evalRow = row.fitEvaluation;
      const pkg = row.applicationPackages[0];

      return {
        id: row.id,
        companyName: row.companyName,
        title: row.title,
        locationRaw: row.locationRaw,
        remotePolicy: row.remotePolicy,
        salaryMinUsd: row.salaryMinUsd,
        salaryMaxUsd: row.salaryMaxUsd,
        salaryRawText: row.salaryRawText,
        atsPlatform: row.atsPlatform,
        applicationUrl: row.applicationUrl,
        cleanDescriptionMarkdown: row.cleanDescriptionMarkdown,
        status: row.status,
        extractedRequirements: row.extractedRequirements,
        extractedQuestions: row.extractedQuestions,
        specialInstructions: row.specialInstructions,
        rejectionReasonCategory: row.rejectionReasonCategory,
        rejectionUserNotes: row.rejectionUserNotes,
        ingestedAt: row.ingestedAt.toISOString(),
        evaluation: evalRow
          ? {
              stage1Passed: evalRow.stage1Passed,
              overallScore: evalRow.overallScore,
              categoryScores: evalRow.categoryScores ?? null,
              executiveSummary: evalRow.executiveSummary,
              flaggedGaps: evalRow.flaggedGaps ?? [],
              hasUnresolvedCriticalGap: evalRow.hasUnresolvedCriticalGap,
              evaluatorModelUsed: evalRow.evaluatorModelUsed,
            }
          : null,
        latestPackage: pkg
          ? {
              id: pkg.id,
              version: pkg.version,
              isImmutableSnapshot: pkg.isImmutableSnapshot,
              currentStep: pkg.currentStep,
              streamChannelId: pkg.streamChannelId,
              tailoredResumeData: pkg.tailoredResumeData ?? null,
              resumeTypstSource: pkg.resumeTypstSource,
              coverLetterMarkdown: pkg.coverLetterMarkdown,
              coverLetterTypstSource: pkg.coverLetterTypstSource,
              screeningQuestionAnswers: pkg.screeningQuestionAnswers ?? [],
              pdfAudit: pkg.pdfAudit ?? null,
              synthesisModelUsed: pkg.synthesisModelUsed,
              applyMode: pkg.applyMode,
              postApplyStage: pkg.postApplyStage,
              stagehandSessionLog: pkg.stagehandSessionLog ?? null,
              submittedAt: pkg.submittedAt ? pkg.submittedAt.toISOString() : null,
            }
          : null,
      };
    });

    return mapped.sort(
      (a, b) => (b.evaluation?.overallScore ?? 0) - (a.evaluation?.overallScore ?? 0)
    );
  } catch {
    return [];
  }
}

export async function getJobStudioDetail(
  jobId: string
): Promise<{
  job: JobWithEvaluationAndPackage | null;
  candidate: Awaited<ReturnType<typeof getOrEnsureCandidateProfile>>;
  availableExperiences: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    bullets: Array<{
      id: string;
      bulletText: string;
      quantifiedMetrics: QuantifiedMetric[];
    }>;
  }>;
}> {
  const candidate = await getOrEnsureCandidateProfile();
  try {
    const row = await db.query.jobPostings.findFirst({
      where: eq(jobPostings.id, jobId),
      with: {
        fitEvaluation: true,
        applicationPackages: {
          orderBy: [desc(applicationPackages.version)],
          limit: 1,
        },
      },
    });

    const experiences = await db.query.careerExperiences.findMany({
      where: eq(careerExperiences.profileId, candidate.id),
      with: {
        bullets: true,
      },
    });

    if (!row) {
      return { job: null, candidate, availableExperiences: [] };
    }

    const evalRow = row.fitEvaluation;
    const pkg = row.applicationPackages[0];

    const job: JobWithEvaluationAndPackage = {
      id: row.id,
      companyName: row.companyName,
      title: row.title,
      locationRaw: row.locationRaw,
      remotePolicy: row.remotePolicy,
      salaryMinUsd: row.salaryMinUsd,
      salaryMaxUsd: row.salaryMaxUsd,
      salaryRawText: row.salaryRawText,
      atsPlatform: row.atsPlatform,
      applicationUrl: row.applicationUrl,
      cleanDescriptionMarkdown: row.cleanDescriptionMarkdown,
      status: row.status,
      extractedRequirements: row.extractedRequirements,
      extractedQuestions: row.extractedQuestions,
      specialInstructions: row.specialInstructions,
      rejectionReasonCategory: row.rejectionReasonCategory,
      rejectionUserNotes: row.rejectionUserNotes,
      ingestedAt: row.ingestedAt.toISOString(),
      evaluation: evalRow
        ? {
            stage1Passed: evalRow.stage1Passed,
            overallScore: evalRow.overallScore,
            categoryScores: evalRow.categoryScores ?? null,
            executiveSummary: evalRow.executiveSummary,
            flaggedGaps: evalRow.flaggedGaps ?? [],
            hasUnresolvedCriticalGap: evalRow.hasUnresolvedCriticalGap,
            evaluatorModelUsed: evalRow.evaluatorModelUsed,
          }
        : null,
      latestPackage: pkg
        ? {
            id: pkg.id,
            version: pkg.version,
            isImmutableSnapshot: pkg.isImmutableSnapshot,
            currentStep: pkg.currentStep,
            streamChannelId: pkg.streamChannelId,
            tailoredResumeData: pkg.tailoredResumeData ?? null,
            resumeTypstSource: pkg.resumeTypstSource,
            coverLetterMarkdown: pkg.coverLetterMarkdown,
            coverLetterTypstSource: pkg.coverLetterTypstSource,
            screeningQuestionAnswers: pkg.screeningQuestionAnswers ?? [],
            pdfAudit: pkg.pdfAudit ?? null,
            synthesisModelUsed: pkg.synthesisModelUsed,
            applyMode: pkg.applyMode,
            postApplyStage: pkg.postApplyStage,
            stagehandSessionLog: pkg.stagehandSessionLog ?? null,
            submittedAt: pkg.submittedAt ? pkg.submittedAt.toISOString() : null,
          }
        : null,
    };

    return {
      job,
      candidate,
      availableExperiences: experiences.map((e) => ({
        id: e.id,
        companyName: e.companyName,
        jobTitle: e.jobTitle,
        bullets: e.bullets.map((b) => ({
          id: b.id,
          bulletText: b.bulletText,
          quantifiedMetrics: b.quantifiedMetrics ?? [],
        })),
      })),
    };
  } catch {
    return { job: null, candidate, availableExperiences: [] };
  }
}

export async function getMasterProfileOverview() {
  const profile = await getOrEnsureCandidateProfile();
  try {
    const [
      experiences,
      projects,
      stories,
      skills,
      sourceDocs,
      preferences,
    ] = await Promise.all([
      db.query.careerExperiences.findMany({
        where: eq(careerExperiences.profileId, profile.id),
        with: { bullets: true },
      }),
      db.query.careerProjects.findMany({
        where: eq(careerProjects.profileId, profile.id),
      }),
      db.query.careerStories.findMany({
        where: eq(careerStories.profileId, profile.id),
      }),
      db.query.careerSkills.findMany({
        where: eq(careerSkills.profileId, profile.id),
        with: { evidenceLinks: true },
      }),
      db.query.careerSources.findMany({
        where: eq(careerSources.profileId, profile.id),
        orderBy: [desc(careerSources.ingestedAt)],
      }),
      db.query.preferenceMemory.findMany({
        where: eq(preferenceMemory.profileId, profile.id),
        orderBy: [desc(preferenceMemory.createdAt)],
      }),
    ]);

    return {
      profile,
      experiences,
      projects,
      stories,
      skills,
      sourceDocs,
      preferences,
    };
  } catch {
    return {
      profile,
      experiences: [],
      projects: [],
      stories: [],
      skills: [],
      sourceDocs: [],
      preferences: [],
    };
  }
}
