import React from 'react';
import Link from 'next/link';
import { Lock, ExternalLink, FileDown } from 'lucide-react';
import { getJobsByStatuses } from '../../../lib/data';

export const dynamic = 'force-dynamic';

export default async function AppliedArchivePage() {
  const jobs = await getJobsByStatuses(['APPLIED', 'REJECTED', 'FILTERED_OUT']);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          Surface D: Applied Tracker & Immutable Snapshot Archive
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Historical system of record with frozen Resume/Cover Letter PDF snapshots and rejected/filtered audit logs.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-12 text-center">
          <p className="text-slate-300 font-medium">
            No archived or submitted applications yet
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const pkg = job.latestPackage;
            return (
              <div
                key={job.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        job.status === 'APPLIED'
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                          : job.status === 'REJECTED'
                          ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {job.status}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {job.title} @ {job.companyName}
                    </h3>
                    {pkg?.isImmutableSnapshot && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                        <Lock className="w-3 h-3" /> Frozen Snapshot v{pkg.version}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                    <span>{job.locationRaw}</span>
                    {pkg?.submittedAt && (
                      <>
                        <span>&bull;</span>
                        <span>
                          Submitted: {new Date(pkg.submittedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                    {pkg?.postApplyStage && job.status === 'APPLIED' && (
                      <>
                        <span>&bull;</span>
                        <span className="text-indigo-300 font-medium">
                          Stage: {pkg.postApplyStage}
                        </span>
                      </>
                    )}
                    {job.rejectionReasonCategory && (
                      <>
                        <span>&bull;</span>
                        <span className="text-rose-300">
                          Reason: {job.rejectionReasonCategory}
                          {job.rejectionUserNotes ? ` ("${job.rejectionUserNotes}")` : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {pkg && (
                    <>
                      <a
                        href={`/api/applications/${job.id}/pdf?type=resume`}
                        download
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>Frozen Resume PDF</span>
                      </a>
                      <Link
                        href={`/studio/${job.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      >
                        Inspect Snapshot
                      </Link>
                    </>
                  )}
                  <a
                    href={job.applicationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
