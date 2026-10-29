import React from 'react';
import { getPipelineCounts } from '../../lib/data';
import { PipelineTopNav } from '../../components/pipeline/PipelineTopNav';

export const dynamic = 'force-dynamic';

export default async function PipelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const counts = await getPipelineCounts();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <PipelineTopNav counts={counts} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
