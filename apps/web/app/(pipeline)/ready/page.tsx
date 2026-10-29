import React from 'react';
import Link from 'next/link';
import { ArrowRight, FileCheck2, Sparkles } from 'lucide-react';
import { getJobsByStatuses } from '../../../lib/data';

export const dynamic = 'force-dynamic';

export default async function ReadyToApplyPage() {
  const jobs = await getJobsByStatuses(['READY_TO_APPLY', 'APPLYING']);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          Surface C: Ready to Apply Queue
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Tailored Resume & Cover Letter vector PDFs compiled and audited. Open the Interactive Document Studio to review or launch Stagehand v4 Assisted Apply.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-12 text-center">
          <p className="text-slate-300 font-medium">
            No application packages ready to apply yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Generate materials from the Approved Queue to move roles here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const audit = job.latestPackage?.pdfAudit;
            return (
              <div
                key={job.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-700">
                      {job.status}
                    </span>
                    <h3 className="text-base font-semibold text-slate-100">
                      {job.title} @ {job.companyName}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>
                      Model:{' '}
                      <strong className="text-slate-200">
                        {job.latestPackage?.synthesisModelUsed ?? 'claude-sonnet-4-6'}
                      </strong>
                    </span>
                    {audit && (
                      <>
                        <span>&bull;</span>
                        <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                          <FileCheck2 className="w-3.5 h-3.5" />
                          {audit.pageCount} Page Vector PDF
                        </span>
                        <span>&bull;</span>
                        <span>
                          ATS Keyword Match:{' '}
                          <strong className="text-slate-200">
                            {audit.atsKeywordCoveragePercent}%
                          </strong>
                        </span>
                        <span>&bull;</span>
                        <span>
                          Zero-Hallucination Audit:{' '}
                          <strong className="text-emerald-300">
                            {audit.zeroHallucinationAuditPassed ? 'PASSED' : 'REVIEW'}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/studio/${job.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Open Split Studio & Assisted Apply</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
