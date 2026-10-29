import React from 'react';
import {
  getJobsByStatuses,
  getMasterProfileOverview,
} from '../../../lib/data';
import { ApprovedQueueClient } from '../../../components/pipeline/ApprovedQueueClient';

export const dynamic = 'force-dynamic';

export default async function ApprovedQueuePage() {
  const [jobs, overview] = await Promise.all([
    getJobsByStatuses(['APPROVED', 'GENERATING', 'PAUSED_NEEDS_INPUT']),
    getMasterProfileOverview(),
  ]);

  const availableExperiences = overview.experiences.map((e) => ({
    id: e.id,
    companyName: e.companyName,
    jobTitle: e.jobTitle,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          Surface B: Approved Queue & Watchable Material Generator
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Selective on-demand batch synthesis with live AG-UI stream replay and inline Critical Skill Gap resolution.
        </p>
      </div>

      <ApprovedQueueClient
        jobs={jobs}
        availableExperiences={availableExperiences}
      />
    </div>
  );
}
