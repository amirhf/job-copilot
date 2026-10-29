import React from 'react';
import { getJobsByStatuses } from '../../../lib/data';
import { TriageInboxClient } from '../../../components/pipeline/TriageInboxClient';

export const dynamic = 'force-dynamic';

export default async function TriageInboxPage() {
  const jobs = await getJobsByStatuses(['TRIAGE_INBOX']);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          Surface A: High-Signal Triage Inbox
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Postings that passed Stage 1 deterministic hard filters, ranked by Stage 2 prompt-cached rubric score.
        </p>
      </div>

      <TriageInboxClient initialJobs={jobs} />
    </div>
  );
}
