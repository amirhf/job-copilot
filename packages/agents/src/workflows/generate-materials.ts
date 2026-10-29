import { z } from 'zod';
import {
  db,
  eq,
  and,
  inArray,
  jobPostings,
  fitEvaluations,
  applicationPackages,
  hybridSearchCareerBullets,
  hybridSearchCareerProjects,
  hybridSearchCareerStories,
  type TailoredResumePayload,
  type AnsweredScreeningQuestion,
  type PdfCompilationAudit,
  type FlaggedSkillGap,
  type SpecialPostingInstruction,
  type ExtractedApplicationQuestion,
  type Database,
} from '@job-copilot/db';
import {
  renderResumeTypstSource,
  renderCoverLetterTypstSource,
  compileResumeWithAutoFit,
  compileTypstToPdf,
  auditCompiledPackage,
  persistCompiledPdfArtifacts,
  type CandidateHeaderInfo,
} from '@job-copilot/pdf-engine';
import {
  generateStructuredWithTier,
  generateSingleEmbedding,
} from '../routers/model-router';
import { publishAgUiEvent } from '../streaming/ag-ui-publisher';
import {
  TargetRoleBlueprintSchema,
  SynthesizedResumeSchema,
  SynthesizedCoverLetterAndQaSchema,
  RESUME_SYNTHESIS_SYSTEM_PROMPT,
  COVER_LETTER_AND_QA_SYSTEM_PROMPT,
} from '../prompts/material-synthesis';
import { addSkillEvidenceFromGapResolution } from '../ingestion/graph-merger';

export const GapResolutionItemSchema = z.object({
  gapId: z.string(),
  action: z.enum(['ADDED_TO_PROFILE', 'BRIDGED', 'IGNORED']),
  bridgeSkillName: z.string().optional(),
  userGuidanceNote: z.string().optional(),
  newProfileEvidence: z
    .object({
      experienceId: z.string(),
      skillName: z.string(),
      proficiency: z.enum(['EXPERT', 'PROFICIENT', 'FAMILIAR']).default('PROFICIENT'),
      newBulletText: z.string(),
    })
    .optional(),
});

export type GapResolutionItem = z.infer<typeof GapResolutionItemSchema>;

export interface GenerateMaterialsContextData {
  jobPostingId: string;
  profileId: string;
  packageId: string;
  streamChannelId: string;
  synthesisModelTier?: 'TIER_3_SYNTHESIS_DEFAULT' | 'TIER_3_SYNTHESIS_PREMIER';
  targetMaxPages?: number;
  candidate: CandidateHeaderInfo & {
    headline: string;
    executiveBio: string | null;
  };
  job: {
    id: string;
    companyName: string;
    title: string;
    locationRaw: string;
    cleanDescriptionMarkdown: string;
    extractedRequirements: {
      mustHaveSkills: string[];
      niceToHaveSkills: string[];
      domainKeywords: string[];
    };
    extractedQuestions: ExtractedApplicationQuestion[];
    specialInstructions: SpecialPostingInstruction[];
  };
  flaggedGaps: FlaggedSkillGap[];
  experiences: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    startDate: string;
    endDate: string | null;
    location: string | null;
    bullets: Array<{
      id: string;
      bulletText: string;
      skillTags: string[];
    }>;
  }>;
  projects: Array<{
    id: string;
    projectName: string;
    tagline: string;
    problemStatement: string;
    architectureAndStack: string;
    highlightBullets: string[];
    techStackTags: string[];
  }>;
  stories: Array<{
    id: string;
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
  }>;
  verifiedSkills: Array<{
    id: string;
    name: string;
    category: string;
  }>;
  writingStyleRules: string[];
  gapResolutions?: GapResolutionItem[];
}

export interface GenerateMaterialsWorkflowResult {
  status: 'COMPLETED' | 'SUSPENDED_ON_GAP';
  packageId: string;
  jobPostingId: string;
  streamChannelId: string;
  unresolvedCriticalGaps?: FlaggedSkillGap[];
  tailoredResumeData?: TailoredResumePayload;
  resumeTypstSource?: string;
  coverLetterMarkdown?: string;
  coverLetterTypstSource?: string;
  screeningQuestionAnswers?: AnsweredScreeningQuestion[];
  pdfAudit?: PdfCompilationAudit;
  compiledResumePdfBase64?: string;
  compiledCoverLetterPdfBase64?: string;
  synthesisModelUsed?: string;
}

/**
 * Executes the 6-Step Watchable Material Generation Pipeline (`packages/agents/src/workflows/generate-materials.ts`):
 * - Step 1: `analyzeRequirements`
 * - Step 2: `selectCareerBlocks`
 * - Step 3: `checkCriticalGaps` (Suspends workflow into `PAUSED_NEEDS_INPUT` if unresolved `CRITICAL` gaps exist)
 * - Step 4: `synthesizeResume` (Streams live `TYPST_SOURCE_UPDATED` preview events)
 * - Step 5: `synthesizeCoverLetterAndQA` (Streams `QA_DRAFTED` & `TYPST_SOURCE_UPDATED`)
 * - Step 6: `compileAndAuditPdf` (Runs auto-fit Typst compilation + Zero-Hallucination metric & keyword audit)
 */
export async function runGenerateMaterialsPipeline(
  ctx: GenerateMaterialsContextData,
  options?: {
    persistEventsToDb?: boolean;
    database?: Database;
  }
): Promise<GenerateMaterialsWorkflowResult> {
  const synthesisTier = ctx.synthesisModelTier ?? 'TIER_3_SYNTHESIS_DEFAULT';

  // STEP 1: analyzeRequirements
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STEP_STARTED',
        step: 'ANALYZING_REQUIREMENTS',
        message: `Analyzing ATS keywords and instructions for ${ctx.job.title} @ ${ctx.job.companyName}...`,
        timestamp: new Date().toISOString(),
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  const { object: targetBlueprint } = await generateStructuredWithTier({
    tier: 'TIER_2_RUBRIC_DEFAULT',
    schema: TargetRoleBlueprintSchema,
    systemPrompt:
      'Extract the target role headline, prioritized ATS keywords, seniority tone, core engineering problems, and mandatory instructions.',
    userPrompt: JSON.stringify({
      companyName: ctx.job.companyName,
      title: ctx.job.title,
      requirements: ctx.job.extractedRequirements,
      specialInstructions: ctx.job.specialInstructions,
      description: ctx.job.cleanDescriptionMarkdown.slice(0, 3500),
    }),
  });

  // STEP 2: selectCareerBlocks
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STEP_STARTED',
        step: 'SELECTING_CAREER_BLOCKS',
        message: 'Selecting highest-ranking experiences, atomic bullets, projects, and STAR stories...',
        timestamp: new Date().toISOString(),
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STATE_SNAPSHOT',
        step: 'SELECTING_CAREER_BLOCKS',
        payload: {
          selectedExperienceCount: ctx.experiences.length,
          selectedBulletCount: ctx.experiences.reduce((acc, e) => acc + e.bullets.length, 0),
          selectedProjectCount: ctx.projects.length,
          selectedStoryCount: ctx.stories.length,
        },
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  // STEP 3: checkCriticalGaps (.suspend() / .resume() Human-in-the-Loop Gate)
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STEP_STARTED',
        step: 'CHECKING_CRITICAL_GAPS',
        message: 'Verifying critical qualification coverage against Master Career Graph...',
        timestamp: new Date().toISOString(),
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  const resolvedGapIds = new Set((ctx.gapResolutions ?? []).map((r) => r.gapId));
  const unresolvedCriticalGaps = ctx.flaggedGaps.filter(
    (g) =>
      g.severity === 'CRITICAL' &&
      g.resolutionStatus === 'OPEN' &&
      !resolvedGapIds.has(g.gapId)
  );

  if (unresolvedCriticalGaps.length > 0) {
    await publishAgUiEvent(
      {
        packageId: ctx.packageId,
        streamChannelId: ctx.streamChannelId,
        event: {
          type: 'WORKFLOW_SUSPENDED_ON_GAP',
          jobPostingId: ctx.jobPostingId,
          unresolvedCriticalGaps,
        },
      },
      { persistToDb: options?.persistEventsToDb, database: options?.database }
    );

    await publishAgUiEvent(
      {
        packageId: ctx.packageId,
        streamChannelId: ctx.streamChannelId,
        event: {
          type: 'RUN_FINISHED',
          packageId: ctx.packageId,
          status: 'PAUSED_NEEDS_INPUT',
        },
      },
      { persistToDb: options?.persistEventsToDb, database: options?.database }
    );

    return {
      status: 'SUSPENDED_ON_GAP',
      packageId: ctx.packageId,
      jobPostingId: ctx.jobPostingId,
      streamChannelId: ctx.streamChannelId,
      unresolvedCriticalGaps,
    };
  }

  // Build bridging directives from resolved gaps + moderate gaps
  const bridgingDirectives = [
    ...(ctx.gapResolutions ?? [])
      .filter((r) => r.action === 'BRIDGED')
      .map(
        (r) =>
          `Bridge gap "${r.gapId}" using verified skill "${r.bridgeSkillName ?? ''}" (${r.userGuidanceNote ?? ''})`
      ),
    ...ctx.flaggedGaps
      .filter((g) => g.severity === 'MODERATE' && g.adjacentVerifiedSkills.length > 0)
      .map(
        (g) =>
          `Bridge moderate gap "${g.missingSkillName}" using adjacent verified skill "${g.adjacentVerifiedSkills[0]!.skillName}": ${g.adjacentVerifiedSkills[0]!.rationale}`
      ),
  ];

  // STEP 4: synthesizeResume
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STEP_STARTED',
        step: 'SYNTHESIZING_RESUME',
        message: 'Synthesizing tailored resume bullets with strict truthfulness guardrails...',
        timestamp: new Date().toISOString(),
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  const { object: tailoredResumeData, modelUsed: synthesisModelUsed } =
    await generateStructuredWithTier({
      tier: synthesisTier,
      schema: SynthesizedResumeSchema,
      systemPrompt: RESUME_SYNTHESIS_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(
        {
          targetBlueprint,
          candidateHeadline: ctx.candidate.headline,
          candidateBio: ctx.candidate.executiveBio,
          verifiedExperiences: ctx.experiences,
          verifiedProjects: ctx.projects,
          verifiedSkills: ctx.verifiedSkills,
          bridgingDirectives,
          writingStyleRules: ctx.writingStyleRules,
        },
        null,
        2
      ),
    });

  // Render initial Typst source and stream live preview update to Watch Drawer
  const initialResumeTypst = renderResumeTypstSource(
    ctx.candidate,
    tailoredResumeData,
    'standard'
  );
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'TYPST_SOURCE_UPDATED',
        documentType: 'RESUME',
        typstSource: initialResumeTypst,
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  // STEP 5: synthesizeCoverLetterAndQA
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STEP_STARTED',
        step: 'SYNTHESIZING_COVER_LETTER_AND_QA',
        message: `Drafting tailored cover letter and ${ctx.job.extractedQuestions.length} screening answers...`,
        timestamp: new Date().toISOString(),
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  const { object: coverLetterAndQa } = await generateStructuredWithTier({
    tier: synthesisTier,
    schema: SynthesizedCoverLetterAndQaSchema,
    systemPrompt: COVER_LETTER_AND_QA_SYSTEM_PROMPT,
    userPrompt: JSON.stringify(
      {
        companyName: ctx.job.companyName,
        jobTitle: ctx.job.title,
        specialInstructions: ctx.job.specialInstructions,
        extractedQuestions: ctx.job.extractedQuestions,
        tailoredResumeSummary: tailoredResumeData.executiveSummary,
        selectedExperiences: tailoredResumeData.selectedExperiences,
        selectedProjects: tailoredResumeData.selectedProjects,
        starStories: ctx.stories,
        writingStyleRules: ctx.writingStyleRules,
      },
      null,
      2
    ),
  });

  const coverLetterTypstSource = renderCoverLetterTypstSource({
    candidate: ctx.candidate,
    companyName: ctx.job.companyName,
    jobTitle: ctx.job.title,
    coverLetterMarkdown: coverLetterAndQa.coverLetterMarkdown,
  });

  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'TYPST_SOURCE_UPDATED',
        documentType: 'COVER_LETTER',
        typstSource: coverLetterTypstSource,
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  for (const qa of coverLetterAndQa.screeningAnswers) {
    await publishAgUiEvent(
      {
        packageId: ctx.packageId,
        streamChannelId: ctx.streamChannelId,
        event: {
          type: 'QA_DRAFTED',
          questionId: qa.questionId,
          questionLabel: qa.questionLabel,
          draftedAnswer: qa.draftedAnswer,
        },
      },
      { persistToDb: options?.persistEventsToDb, database: options?.database }
    );
  }

  // STEP 6: compileAndAuditPdf
  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'STEP_STARTED',
        step: 'COMPILING_AND_AUDITING_PDF',
        message: 'Compiling vector PDFs and auditing page count, ATS keywords, and metric fidelity...',
        timestamp: new Date().toISOString(),
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  const [fittedResume, compiledCoverLetter] = await Promise.all([
    compileResumeWithAutoFit({
      candidate: ctx.candidate,
      resumePayload: tailoredResumeData,
      targetMaxPages: ctx.targetMaxPages ?? 1,
    }),
    compileTypstToPdf(coverLetterTypstSource, 'standard'),
  ]);

  const pdfAudit = auditCompiledPackage({
    pageCount: fittedResume.compiled.pageCount,
    targetMaxPages: ctx.targetMaxPages ?? 1,
    resumePayload: fittedResume.fittedPayload,
    coverLetterMarkdown: coverLetterAndQa.coverLetterMarkdown,
    screeningAnswers: coverLetterAndQa.screeningAnswers,
    targetKeywords: [
      ...ctx.job.extractedRequirements.mustHaveSkills,
      ...ctx.job.extractedRequirements.niceToHaveSkills,
    ],
    specialInstructions: ctx.job.specialInstructions,
  });

  const storedArtifacts = await persistCompiledPdfArtifacts({
    jobPostingId: ctx.jobPostingId,
    version: 1,
    resumePdfBuffer: fittedResume.compiled.pdfBuffer,
    coverLetterPdfBuffer: compiledCoverLetter.pdfBuffer,
  });

  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'AUDIT_COMPLETED',
        audit: pdfAudit,
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  await publishAgUiEvent(
    {
      packageId: ctx.packageId,
      streamChannelId: ctx.streamChannelId,
      event: {
        type: 'RUN_FINISHED',
        packageId: ctx.packageId,
        status: 'READY_TO_APPLY',
      },
    },
    { persistToDb: options?.persistEventsToDb, database: options?.database }
  );

  return {
    status: 'COMPLETED',
    packageId: ctx.packageId,
    jobPostingId: ctx.jobPostingId,
    streamChannelId: ctx.streamChannelId,
    tailoredResumeData: fittedResume.fittedPayload,
    resumeTypstSource: fittedResume.compiled.typstSource,
    coverLetterMarkdown: coverLetterAndQa.coverLetterMarkdown,
    coverLetterTypstSource,
    screeningQuestionAnswers: coverLetterAndQa.screeningAnswers,
    pdfAudit,
    compiledResumePdfBase64: storedArtifacts.compiledResumePdfBase64,
    compiledCoverLetterPdfBase64: storedArtifacts.compiledCoverLetterPdfBase64,
    synthesisModelUsed,
  };
}

/**
 * Full database-backed execution wrapper for `runGenerateMaterialsPipeline`.
 * Loads the job, candidate profile, hybrid-ranked Career Blocks, and Preference Memory rules,
 * executes the 6-step pipeline, and persists state transitions to PostgreSQL.
 */
export async function executeGenerateMaterialsForJob(params: {
  jobPostingId: string;
  profileId: string;
  synthesisModelTier?: 'TIER_3_SYNTHESIS_DEFAULT' | 'TIER_3_SYNTHESIS_PREMIER';
  gapResolutions?: GapResolutionItem[];
  database?: Database;
}): Promise<GenerateMaterialsWorkflowResult> {
  const database = params.database ?? db;

  // 1. If the user submitted new profile evidence in `gapResolutions`, persist it to the Master Career Graph first
  if (params.gapResolutions && params.gapResolutions.length > 0) {
    for (const res of params.gapResolutions) {
      if (res.action === 'ADDED_TO_PROFILE' && res.newProfileEvidence) {
        await addSkillEvidenceFromGapResolution({
          profileId: params.profileId,
          experienceId: res.newProfileEvidence.experienceId,
          skillName: res.newProfileEvidence.skillName,
          proficiency: res.newProfileEvidence.proficiency,
          newBulletText: res.newProfileEvidence.newBulletText,
          database,
        });
      }
    }
  }

  const [job, profile] = await Promise.all([
    database.query.jobPostings.findFirst({
      where: (jp, { eq: eqOp }) => eqOp(jp.id, params.jobPostingId),
      with: { fitEvaluation: true },
    }),
    database.query.candidateProfile.findFirst({
      where: (cp, { eq: eqOp }) => eqOp(cp.id, params.profileId),
    }),
  ]);

  if (!job) throw new Error(`Job posting ${params.jobPostingId} not found`);
  if (!profile) throw new Error(`Candidate profile ${params.profileId} not found`);

  // Update flaggedGaps resolution statuses if gapResolutions were provided
  let currentFlaggedGaps = job.fitEvaluation?.flaggedGaps ?? [];
  if (params.gapResolutions && params.gapResolutions.length > 0 && job.fitEvaluation) {
    const resMap = new Map(params.gapResolutions.map((r) => [r.gapId, r]));
    currentFlaggedGaps = currentFlaggedGaps.map((g) => {
      const match = resMap.get(g.gapId);
      if (!match) return g;
      return {
        ...g,
        resolutionStatus: match.action,
        resolutionNote: match.userGuidanceNote,
        resolvedAt: new Date().toISOString(),
      };
    });

    const stillHasCritical = currentFlaggedGaps.some(
      (g) => g.severity === 'CRITICAL' && g.resolutionStatus === 'OPEN'
    );

    await database
      .update(fitEvaluations)
      .set({
        flaggedGaps: currentFlaggedGaps,
        hasUnresolvedCriticalGap: stillHasCritical,
      })
      .where(eq(fitEvaluations.id, job.fitEvaluation.id));
  }

  // Create or load active draft application_packages row
  const existingPkg = await database.query.applicationPackages.findFirst({
    where: (ap) =>
      and(eq(ap.jobPostingId, job.id), eq(ap.isImmutableSnapshot, false)),
  });

  const streamChannelId =
    existingPkg?.streamChannelId ?? `stream_${job.id}_${Date.now()}`;

  let packageId = existingPkg?.id;
  if (!packageId) {
    const [insertedPkg] = await database
      .insert(applicationPackages)
      .values({
        jobPostingId: job.id,
        currentStep: 'ANALYZING_REQUIREMENTS',
        streamChannelId,
      })
      .returning();
    if (!insertedPkg) throw new Error('Failed to create application_packages row');
    packageId = insertedPkg.id;
  }

  await database
    .update(jobPostings)
    .set({ status: 'GENERATING', updatedAt: new Date() })
    .where(eq(jobPostings.id, job.id));

  // Retrieve hybrid-ranked career blocks
  const queryText = [
    job.title,
    ...job.extractedRequirements.mustHaveSkills,
    ...job.extractedRequirements.niceToHaveSkills,
  ].join(' ');
  const queryEmbedding =
    job.embedding ?? (await generateSingleEmbedding(`${queryText}\n${job.cleanDescriptionMarkdown.slice(0, 3000)}`));

  const [
    rankedBullets,
    rankedProjects,
    rankedStories,
    allExperiences,
    verifiedSkills,
    stylePrefs,
  ] = await Promise.all([
    hybridSearchCareerBullets({
      profileId: profile.id,
      queryText,
      queryEmbedding,
      limit: 30,
    }),
    hybridSearchCareerProjects({
      profileId: profile.id,
      queryText,
      queryEmbedding,
      limit: 4,
    }),
    hybridSearchCareerStories({
      profileId: profile.id,
      queryText,
      queryEmbedding,
      limit: 6,
    }),
    database.query.careerExperiences.findMany({
      where: (ce, { eq: eqOp }) => eqOp(ce.profileId, profile.id),
      with: { bullets: true },
    }),
    database.query.careerSkills.findMany({
      where: (cs) => and(eq(cs.profileId, profile.id), eq(cs.isUserVerified, true)),
    }),
    database.query.preferenceMemory.findMany({
      where: (pm) =>
        and(
          eq(pm.profileId, profile.id),
          eq(pm.isActive, true),
          inArray(pm.preferenceType, ['PHRASING_REPLACEMENT', 'TONE_AND_STYLE_RULE'])
        ),
    }),
  ]);

  const rankedBulletIds = new Set(rankedBullets.map((b) => b.id));

  const result = await runGenerateMaterialsPipeline(
    {
      jobPostingId: job.id,
      profileId: profile.id,
      packageId,
      streamChannelId,
      synthesisModelTier: params.synthesisModelTier,
      candidate: {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        locationCity: profile.locationCity,
        linkedinUrl: profile.links.linkedinUrl,
        githubUrl: profile.links.githubUrl,
        portfolioUrl: profile.links.portfolioUrl,
        headline: profile.headline,
        executiveBio: profile.executiveBio,
      },
      job: {
        id: job.id,
        companyName: job.companyName,
        title: job.title,
        locationRaw: job.locationRaw,
        cleanDescriptionMarkdown: job.cleanDescriptionMarkdown,
        extractedRequirements: job.extractedRequirements,
        extractedQuestions: job.extractedQuestions,
        specialInstructions: job.specialInstructions,
      },
      flaggedGaps: currentFlaggedGaps,
      experiences: allExperiences.map((exp) => {
        const prioritized = exp.bullets.filter((b) => rankedBulletIds.has(b.id));
        const bulletsToUse = prioritized.length > 0 ? prioritized.slice(0, 6) : exp.bullets.slice(0, 5);
        return {
          id: exp.id,
          companyName: exp.companyName,
          jobTitle: exp.jobTitle,
          startDate: exp.startDate,
          endDate: exp.endDate,
          location: exp.location,
          bullets: bulletsToUse.map((b) => ({
            id: b.id,
            bulletText: b.bulletText,
            skillTags: b.skillTags,
          })),
        };
      }),
      projects: rankedProjects.map((p) => ({
        id: p.id,
        projectName: p.projectName,
        tagline: p.tagline,
        problemStatement: p.problemStatement,
        architectureAndStack: p.architectureAndStack,
        highlightBullets: p.highlightBullets,
        techStackTags: p.techStackTags,
      })),
      stories: rankedStories.map((s) => ({
        id: s.id,
        title: s.title,
        situation: s.situation,
        task: s.task,
        action: s.action,
        result: s.result,
      })),
      verifiedSkills: verifiedSkills.map((sk) => ({
        id: sk.id,
        name: sk.name,
        category: sk.category,
      })),
      writingStyleRules: stylePrefs.map((p) => p.ruleStatement),
      gapResolutions: params.gapResolutions,
    },
    { persistEventsToDb: true, database }
  );

  if (result.status === 'SUSPENDED_ON_GAP') {
    await Promise.all([
      database
        .update(jobPostings)
        .set({ status: 'PAUSED_NEEDS_INPUT', updatedAt: new Date() })
        .where(eq(jobPostings.id, job.id)),
      database
        .update(applicationPackages)
        .set({ currentStep: 'PAUSED_ON_GAP', updatedAt: new Date() })
        .where(eq(applicationPackages.id, packageId)),
    ]);
    return result;
  }

  await Promise.all([
    database
      .update(applicationPackages)
      .set({
        currentStep: 'COMPLETED',
        tailoredResumeData: result.tailoredResumeData,
        resumeTypstSource: result.resumeTypstSource,
        coverLetterMarkdown: result.coverLetterMarkdown,
        coverLetterTypstSource: result.coverLetterTypstSource,
        screeningQuestionAnswers: result.screeningQuestionAnswers ?? [],
        pdfAudit: result.pdfAudit,
        compiledResumePdfBase64: result.compiledResumePdfBase64,
        compiledCoverLetterPdfBase64: result.compiledCoverLetterPdfBase64,
        synthesisModelUsed: result.synthesisModelUsed ?? 'claude-sonnet-4-6',
        updatedAt: new Date(),
      })
      .where(eq(applicationPackages.id, packageId)),
    database
      .update(jobPostings)
      .set({ status: 'READY_TO_APPLY', updatedAt: new Date() })
      .where(eq(jobPostings.id, job.id)),
  ]);

  return result;
}
