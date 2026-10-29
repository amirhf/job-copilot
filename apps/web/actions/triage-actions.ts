'use server';

import { revalidatePath } from 'next/cache';
import {
  db,
  eq,
  inArray,
  jobPostings,
} from '@job-copilot/db';
import { recordJobRejectionMemory } from '@job-copilot/agents';
import { getOrEnsureCandidateProfile } from '../lib/data';

export async function approveJobAction(jobPostingId: string) {
  await db
    .update(jobPostings)
    .set({
      status: 'APPROVED',
      updatedAt: new Date(),
    })
    .where(eq(jobPostings.id, jobPostingId));

  revalidatePath('/inbox');
  revalidatePath('/approved');
  return { ok: true, jobPostingId, status: 'APPROVED' as const };
}

export async function bulkApproveJobsAction(jobPostingIds: string[]) {
  if (jobPostingIds.length === 0) {
    return { ok: true, approvedCount: 0 };
  }

  await db
    .update(jobPostings)
    .set({
      status: 'APPROVED',
      updatedAt: new Date(),
    })
    .where(inArray(jobPostings.id, jobPostingIds));

  revalidatePath('/inbox');
  revalidatePath('/approved');
  return { ok: true, approvedCount: jobPostingIds.length };
}

export async function rejectJobWithFeedbackAction(params: {
  jobPostingId: string;
  rejectionReasonCategory: string;
  userFeedbackNote?: string;
  learnPreferenceRule?: boolean;
}) {
  const profile = await getOrEnsureCandidateProfile();
  const job = await db.query.jobPostings.findFirst({
    where: eq(jobPostings.id, params.jobPostingId),
  });

  await db
    .update(jobPostings)
    .set({
      status: 'REJECTED',
      rejectionReasonCategory: params.rejectionReasonCategory,
      rejectionUserNotes: params.userFeedbackNote ?? null,
      updatedAt: new Date(),
    })
    .where(eq(jobPostings.id, params.jobPostingId));

  let learnedRule: {
    action: 'INSERTED' | 'REINFORCED';
    memoryId: string;
    ruleStatement: string;
    confidenceWeight: number;
  } | null = null;

  if (
    job &&
    (params.learnPreferenceRule || Boolean(params.userFeedbackNote?.trim()))
  ) {
    learnedRule = await recordJobRejectionMemory({
      profileId: profile.id,
      jobPostingId: job.id,
      companyName: job.companyName,
      jobTitle: job.title,
      rejectionReasonCategory: params.rejectionReasonCategory,
      userFeedbackNote: params.userFeedbackNote,
    });
  }

  revalidatePath('/inbox');
  revalidatePath('/applied');
  revalidatePath('/profile');

  return {
    ok: true,
    jobPostingId: params.jobPostingId,
    status: 'REJECTED' as const,
    learnedRule,
  };
}
