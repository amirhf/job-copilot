'use server';

import { revalidatePath } from 'next/cache';
import {
  db,
  eq,
  jobPostings,
  applicationPackages,
  type TailoredResumePayload,
  type AnsweredScreeningQuestion,
} from '@job-copilot/db';
import {
  renderResumeTypstSource,
  renderCoverLetterTypstSource,
  compileTypstToPdf,
  auditCompiledPackage,
  persistCompiledPdfArtifacts,
  type TypstLayoutDensity,
} from '@job-copilot/pdf-engine';
import { recordStudioPhrasingMemory } from '@job-copilot/agents';
import { getOrEnsureCandidateProfile } from '../lib/data';

export interface StudioEditSaveInput {
  jobPostingId: string;
  packageId: string;
  tailoredResumeData: TailoredResumePayload;
  rawResumeTypstOverride?: string;
  coverLetterMarkdown: string;
  screeningQuestionAnswers: AnsweredScreeningQuestion[];
  layoutDensity?: TypstLayoutDensity;
  phrasingMemoryLearning?: {
    saveToPreferenceMemory: boolean;
    originalTextSnippet: string;
    userEditedTextSnippet: string;
    scope: 'RESUME_BULLETS' | 'COVER_LETTER' | 'SCREENING_QA';
  };
}

export async function saveStudioEditAction(input: StudioEditSaveInput) {
  const candidate = await getOrEnsureCandidateProfile();
  const job = await db.query.jobPostings.findFirst({
    where: eq(jobPostings.id, input.jobPostingId),
  });
  const pkg = await db.query.applicationPackages.findFirst({
    where: eq(applicationPackages.id, input.packageId),
  });

  if (!job || !pkg) {
    throw new Error(`Application package ${input.packageId} or job ${input.jobPostingId} not found.`);
  }
  if (pkg.isImmutableSnapshot) {
    throw new Error('Cannot edit an immutable submitted application snapshot.');
  }

  const candidateHeader = {
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone ?? undefined,
    locationCity: candidate.locationCity,
    linkedinUrl: candidate.links?.linkedinUrl,
    githubUrl: candidate.links?.githubUrl,
    portfolioUrl: candidate.links?.portfolioUrl,
  };

  const density = input.layoutDensity ?? 'standard';
  const resumeTypstSource =
    input.rawResumeTypstOverride?.trim() ||
    renderResumeTypstSource(candidateHeader, input.tailoredResumeData, density);

  const compiledResume = await compileTypstToPdf(resumeTypstSource, density);

  const coverLetterTypstSource = renderCoverLetterTypstSource({
    candidate: candidateHeader,
    companyName: job.companyName,
    jobTitle: job.title,
    coverLetterMarkdown: input.coverLetterMarkdown,
  });
  const compiledCoverLetter = await compileTypstToPdf(coverLetterTypstSource, 'standard');

  const targetKeywords = [
    ...(job.extractedRequirements?.mustHaveSkills ?? []),
    ...(job.extractedRequirements?.niceToHaveSkills ?? []),
  ];

  const pdfAudit = auditCompiledPackage({
    pageCount: compiledResume.pageCount,
    targetMaxPages: 1,
    resumePayload: input.tailoredResumeData,
    coverLetterMarkdown: input.coverLetterMarkdown,
    screeningAnswers: input.screeningQuestionAnswers,
    targetKeywords,
    specialInstructions: job.specialInstructions ?? [],
  });

  const storedPdfs = await persistCompiledPdfArtifacts({
    jobPostingId: job.id,
    version: pkg.version,
    resumePdfBuffer: compiledResume.pdfBuffer,
    coverLetterPdfBuffer: compiledCoverLetter.pdfBuffer,
  });

  await db
    .update(applicationPackages)
    .set({
      tailoredResumeData: input.tailoredResumeData,
      resumeTypstSource,
      coverLetterMarkdown: input.coverLetterMarkdown,
      coverLetterTypstSource,
      screeningQuestionAnswers: input.screeningQuestionAnswers,
      pdfAudit,
      storageProvider: storedPdfs.storageProvider,
      compiledResumePdfBase64: storedPdfs.compiledResumePdfBase64,
      compiledCoverLetterPdfBase64: storedPdfs.compiledCoverLetterPdfBase64,
      compiledResumePdfPath: storedPdfs.compiledResumePdfPath,
      compiledCoverLetterPdfPath: storedPdfs.compiledCoverLetterPdfPath,
      updatedAt: new Date(),
    })
    .where(eq(applicationPackages.id, pkg.id));

  let learnedPreference: Awaited<ReturnType<typeof recordStudioPhrasingMemory>> | null = null;
  if (
    input.phrasingMemoryLearning?.saveToPreferenceMemory &&
    input.phrasingMemoryLearning.originalTextSnippet.trim() !==
      input.phrasingMemoryLearning.userEditedTextSnippet.trim()
  ) {
    learnedPreference = await recordStudioPhrasingMemory({
      profileId: candidate.id,
      jobPostingId: job.id,
      originalTextSnippet: input.phrasingMemoryLearning.originalTextSnippet,
      userEditedTextSnippet: input.phrasingMemoryLearning.userEditedTextSnippet,
      defaultScope: input.phrasingMemoryLearning.scope,
    });
  }

  revalidatePath(`/studio/${job.id}`);
  revalidatePath('/ready');
  revalidatePath('/profile');

  return {
    ok: true,
    pdfAudit,
    svgPreview: compiledResume.svgPages[0] ?? '',
    resumeTypstSource,
    learnedPreference,
  };
}

export async function confirmApplicationSubmittedAction(params: {
  jobPostingId: string;
  packageId: string;
  applyMode: 'STAGEHAND_HEADED' | 'COPY_PASTE_KIT' | 'MANUAL_DIRECT';
}) {
  const submittedAt = new Date();

  await db
    .update(applicationPackages)
    .set({
      isImmutableSnapshot: true,
      applyMode: params.applyMode,
      postApplyStage: 'APPLIED_AWAITING_RESPONSE',
      submittedAt,
      updatedAt: submittedAt,
    })
    .where(eq(applicationPackages.id, params.packageId));

  await db
    .update(jobPostings)
    .set({
      status: 'APPLIED',
      updatedAt: submittedAt,
    })
    .where(eq(jobPostings.id, params.jobPostingId));

  revalidatePath('/ready');
  revalidatePath('/applied');
  revalidatePath(`/studio/${params.jobPostingId}`);

  return {
    ok: true,
    jobPostingId: params.jobPostingId,
    packageId: params.packageId,
    isImmutableSnapshot: true,
    submittedAt: submittedAt.toISOString(),
  };
}

export async function updatePostApplyOutcomeAction(params: {
  packageId: string;
  postApplyStage:
    | 'APPLIED_AWAITING_RESPONSE'
    | 'RECRUITER_SCREEN'
    | 'TECHNICAL_INTERVIEW'
    | 'FINAL_ROUND'
    | 'OFFER_RECEIVED'
    | 'POST_APPLY_REJECTED'
    | 'WITHDRAWN';
}) {
  await db
    .update(applicationPackages)
    .set({
      postApplyStage: params.postApplyStage,
      updatedAt: new Date(),
    })
    .where(eq(applicationPackages.id, params.packageId));

  revalidatePath('/applied');
  return { ok: true, packageId: params.packageId, postApplyStage: params.postApplyStage };
}
