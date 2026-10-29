import React from 'react';
import { notFound } from 'next/navigation';
import { getJobStudioDetail } from '../../../lib/data';
import { StudioEditorClient } from '../../../components/studio/StudioEditorClient';

export const dynamic = 'force-dynamic';

export default async function StudioJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const { job, candidate, availableExperiences } = await getJobStudioDetail(jobId);

  if (!job) {
    notFound();
  }

  return (
    <StudioEditorClient
      job={job}
      candidate={{
        id: candidate.id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        locationCity: candidate.locationCity,
        linkedinUrl: candidate.links?.linkedinUrl ?? null,
        githubUrl: candidate.links?.githubUrl ?? null,
        portfolioUrl: candidate.links?.portfolioUrl ?? null,
      }}
      availableExperiences={availableExperiences}
    />
  );
}
