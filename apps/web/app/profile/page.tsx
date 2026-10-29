import React from 'react';
import { getPipelineCounts, getMasterProfileOverview } from '../../lib/data';
import { PipelineTopNav } from '../../components/pipeline/PipelineTopNav';
import { ProfileBuilderClient } from '../../components/profile/ProfileBuilderClient';

export const dynamic = 'force-dynamic';

export default async function ProfileBuilderPage() {
  const [counts, overview] = await Promise.all([
    getPipelineCounts(),
    getMasterProfileOverview(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <PipelineTopNav counts={counts} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Master Career Graph, Rubric Configuration & Preference Memory
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Every skill in your Master Career Graph requires at least one verified evidence edge. Configure Stage 1 hard filters, Stage 2 rubric weights, and learned preferences.
          </p>
        </div>

        <ProfileBuilderClient
          profile={overview.profile}
          experiences={overview.experiences}
          projects={overview.projects}
          skills={overview.skills}
          preferences={overview.preferences}
        />
      </main>
    </div>
  );
}
