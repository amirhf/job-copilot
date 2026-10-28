import { eq, and, inArray } from 'drizzle-orm';
import {
  db,
  jobPostings,
  fitEvaluations,
  hybridSearchCareerBullets,
  hybridSearchCareerProjects,
  type Database,
} from '@job-copilot/db';
import { generateSingleEmbedding } from '../routers/model-router';
import { evaluateStage1HardFilters } from '../evaluators/stage1-filter';
import { evaluateStage2Rubric } from '../evaluators/stage2-rubric';

export interface IngestAndScoreJobInput {
  jobPostingId: string;
  profileId: string;
  database?: Database;
}

export interface IngestAndScoreJobResult {
  jobPostingId: string;
  stage1Passed: boolean;
  status: 'FILTERED_OUT' | 'TRIAGE_INBOX';
  overallScore: number | null;
  hasUnresolvedCriticalGap: boolean;
  evaluatorModelUsed: string | null;
}

/**
 * Executes the complete Two-Stage Fit Engine on an ingested job posting:
 * 1. Evaluates Stage 1b deterministic hard filters (0 LLM tokens). If failed, marks job FILTERED_OUT.
 * 2. Generates 768-dim job vector embedding and runs hybrid RRF search against the Master Career Graph.
 * 3. Runs Stage 2 Prompt-Cached Rubric Scoring (with automatic borderline escalation to Pro).
 * 4. Persists `fit_evaluations` and transitions the job to `TRIAGE_INBOX`.
 */
export async function executeIngestAndScoreJob(
  input: IngestAndScoreJobInput
): Promise<IngestAndScoreJobResult> {
  const database = input.database ?? db;

  const [job, profile] = await Promise.all([
    database.query.jobPostings.findFirst({
      where: (jp, { eq: eqOp }) => eqOp(jp.id, input.jobPostingId),
    }),
    database.query.candidateProfile.findFirst({
      where: (cp, { eq: eqOp }) => eqOp(cp.id, input.profileId),
    }),
  ]);

  if (!job) throw new Error(`Job posting ${input.jobPostingId} not found`);
  if (!profile) throw new Error(`Candidate profile ${input.profileId} not found`);

  // Step 1: Deterministic Stage 1b Gate (Zero LLM Tokens)
  const stage1 = evaluateStage1HardFilters(job, profile.hardFilters);
  if (!stage1.passed) {
    await database.transaction(async (tx) => {
      await tx
        .insert(fitEvaluations)
        .values({
          jobPostingId: job.id,
          stage1Passed: false,
          stage1KnockoutReasons: stage1.knockoutReasons,
          overallScore: null,
          hasUnresolvedCriticalGap: false,
        })
        .onConflictDoUpdate({
          target: fitEvaluations.jobPostingId,
          set: {
            stage1Passed: false,
            stage1KnockoutReasons: stage1.knockoutReasons,
            overallScore: null,
            evaluatedAt: new Date(),
          },
        });

      await tx
        .update(jobPostings)
        .set({ status: 'FILTERED_OUT', updatedAt: new Date() })
        .where(eq(jobPostings.id, job.id));
    });

    return {
      jobPostingId: job.id,
      stage1Passed: false,
      status: 'FILTERED_OUT',
      overallScore: null,
      hasUnresolvedCriticalGap: false,
      evaluatorModelUsed: null,
    };
  }

  // Step 2: Generate 768-dim job embedding if not already present
  const searchQueryText = [
    job.title,
    ...job.extractedRequirements.mustHaveSkills,
    ...job.extractedRequirements.niceToHaveSkills,
    ...job.extractedRequirements.domainKeywords,
  ].join(' ');

  const jobEmbedding =
    job.embedding ??
    (await generateSingleEmbedding(`${searchQueryText}\n${job.cleanDescriptionMarkdown.slice(0, 4000)}`));

  if (!job.embedding) {
    await database
      .update(jobPostings)
      .set({ embedding: jobEmbedding, updatedAt: new Date() })
      .where(eq(jobPostings.id, job.id));
  }

  // Step 3: Hybrid RRF Retrieval + Static Candidate Profile Context (strictly is_user_verified = true skills)
  const [
    topBullets,
    topProjects,
    experiences,
    verifiedSkills,
    scoringPreferences,
  ] = await Promise.all([
    hybridSearchCareerBullets({
      profileId: profile.id,
      queryText: searchQueryText,
      queryEmbedding: jobEmbedding,
      limit: 25,
    }),
    hybridSearchCareerProjects({
      profileId: profile.id,
      queryText: searchQueryText,
      queryEmbedding: jobEmbedding,
      limit: 8,
    }),
    database.query.careerExperiences.findMany({
      where: (ce, { eq: eqOp }) => eqOp(ce.profileId, profile.id),
    }),
    database.query.careerSkills.findMany({
      where: (cs) => and(eq(cs.profileId, profile.id), eq(cs.isUserVerified, true)),
    }),
    database.query.preferenceMemory.findMany({
      where: (pm) =>
        and(
          eq(pm.profileId, profile.id),
          eq(pm.isActive, true),
          inArray(pm.preferenceType, ['JOB_REJECTION_PATTERN', 'RUBRIC_CALIBRATION'])
        ),
    }),
  ]);

  // Step 4: Stage 2 Prompt-Cached Rubric Evaluation
  const stage2Result = await evaluateStage2Rubric({
    candidateStaticContext: {
      headline: profile.headline,
      executiveBio: profile.executiveBio,
      totalYearsExperience: profile.totalYearsExperience,
      targetRoles: profile.targetRoles,
      verifiedSkills: verifiedSkills.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        proficiency: s.proficiency,
        adjacentSkillSlugs: s.adjacentSkillSlugs,
      })),
      experiencesOverview: experiences.map((e) => ({
        id: e.id,
        companyName: e.companyName,
        jobTitle: e.jobTitle,
        startDate: e.startDate,
        endDate: e.endDate,
        roleOverview: e.roleOverview,
        primaryTechStack: e.primaryTechStack,
      })),
      learnedScoringPreferences: scoringPreferences.map((p) => ({
        preferenceType: p.preferenceType,
        ruleStatement: p.ruleStatement,
        confidenceWeight: p.confidenceWeight,
      })),
    },
    jobContext: {
      job: {
        id: job.id,
        companyName: job.companyName,
        title: job.title,
        locationRaw: job.locationRaw,
        remotePolicy: job.remotePolicy,
        salaryMinUsd: job.salaryMinUsd,
        salaryMaxUsd: job.salaryMaxUsd,
        cleanDescriptionMarkdown: job.cleanDescriptionMarkdown,
        extractedRequirements: job.extractedRequirements,
      },
      topHybridBullets: topBullets.map((b) => ({
        id: b.id,
        experienceId: b.experienceId,
        bulletText: b.bulletText,
        skillTags: b.skillTags,
        rrfScore: b.rrfScore,
      })),
      topHybridProjects: topProjects.map((p) => ({
        id: p.id,
        projectName: p.projectName,
        tagline: p.tagline,
        architectureAndStack: p.architectureAndStack,
        techStackTags: p.techStackTags,
        rrfScore: p.rrfScore,
      })),
    },
    rubricWeights: profile.rubricWeights,
  });

  // Step 5: Persist fit_evaluations and move job to TRIAGE_INBOX
  await database.transaction(async (tx) => {
    await tx
      .insert(fitEvaluations)
      .values({
        jobPostingId: job.id,
        stage1Passed: true,
        stage1KnockoutReasons: [],
        overallScore: stage2Result.overallScore,
        categoryScores: stage2Result.categoryScoresWithWeights,
        executiveSummary: stage2Result.executiveSummary,
        topMatchedBlockIds: stage2Result.topMatchedBlockIds,
        flaggedGaps: stage2Result.flaggedGaps,
        hasUnresolvedCriticalGap: stage2Result.hasUnresolvedCriticalGap,
        evaluatorModelUsed: stage2Result.evaluatorModelUsed,
      })
      .onConflictDoUpdate({
        target: fitEvaluations.jobPostingId,
        set: {
          stage1Passed: true,
          stage1KnockoutReasons: [],
          overallScore: stage2Result.overallScore,
          categoryScores: stage2Result.categoryScoresWithWeights,
          executiveSummary: stage2Result.executiveSummary,
          topMatchedBlockIds: stage2Result.topMatchedBlockIds,
          flaggedGaps: stage2Result.flaggedGaps,
          hasUnresolvedCriticalGap: stage2Result.hasUnresolvedCriticalGap,
          evaluatorModelUsed: stage2Result.evaluatorModelUsed,
          evaluatedAt: new Date(),
        },
      });

    await tx
      .update(jobPostings)
      .set({ status: 'TRIAGE_INBOX', updatedAt: new Date() })
      .where(eq(jobPostings.id, job.id));
  });

  return {
    jobPostingId: job.id,
    stage1Passed: true,
    status: 'TRIAGE_INBOX',
    overallScore: stage2Result.overallScore,
    hasUnresolvedCriticalGap: stage2Result.hasUnresolvedCriticalGap,
    evaluatorModelUsed: stage2Result.evaluatorModelUsed,
  };
}
