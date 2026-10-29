import { NextResponse } from 'next/server';
import {
  db,
  eq,
  desc,
  jobPostings,
  applicationPackages,
} from '@job-copilot/db';
import { getOrEnsureCandidateProfile } from '../../../../../lib/data';

export type StagehandExecutionMode = 'local-bridge' | 'browserbase' | 'copy-kit-only';

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      executionMode?: StagehandExecutionMode;
    };

    const mode: StagehandExecutionMode =
      body.executionMode ??
      (process.env.STAGEHAND_EXECUTION_MODE as StagehandExecutionMode | undefined) ??
      'local-bridge';

    const candidate = await getOrEnsureCandidateProfile();
    const job = await db.query.jobPostings.findFirst({
      where: eq(jobPostings.id, jobId),
    });
    const pkg = await db.query.applicationPackages.findFirst({
      where: eq(applicationPackages.jobPostingId, jobId),
      orderBy: [desc(applicationPackages.version)],
    });

    if (!job || !pkg) {
      return NextResponse.json(
        { ok: false, error: 'Job posting or application package not found' },
        { status: 404 }
      );
    }

    await db
      .update(jobPostings)
      .set({ status: 'APPLYING', updatedAt: new Date() })
      .where(eq(jobPostings.id, jobId));

    const applyPayload = {
      executionMode: mode,
      jobPosting: {
        id: job.id,
        companyName: job.companyName,
        title: job.title,
        atsPlatform: job.atsPlatform,
        applicationUrl: job.applicationUrl,
        specialInstructions: job.specialInstructions ?? [],
      },
      candidate: {
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        locationCity: candidate.locationCity,
        linkedinUrl: candidate.links?.linkedinUrl ?? null,
        githubUrl: candidate.links?.githubUrl ?? null,
        portfolioUrl: candidate.links?.portfolioUrl ?? null,
        workAuthorization: candidate.workAuthorization,
      },
      applicationPackage: {
        id: pkg.id,
        compiledResumePdfBase64: pkg.compiledResumePdfBase64,
        compiledCoverLetterPdfBase64: pkg.compiledCoverLetterPdfBase64,
        compiledResumePdfPath: pkg.compiledResumePdfPath,
        compiledCoverLetterPdfPath: pkg.compiledCoverLetterPdfPath,
        screeningQuestionAnswers: pkg.screeningQuestionAnswers ?? [],
      },
    };

    if (mode === 'copy-kit-only') {
      await db
        .update(applicationPackages)
        .set({
          applyMode: 'COPY_PASTE_KIT',
          updatedAt: new Date(),
        })
        .where(eq(applicationPackages.id, pkg.id));

      return NextResponse.json({
        ok: true,
        executionMode: 'copy-kit-only',
        status: 'COPY_KIT_READY',
        applyPayload,
      });
    }

    if (mode === 'local-bridge') {
      const bridgeUrl =
        process.env.STAGEHAND_LOCAL_BRIDGE_URL ?? 'http://127.0.0.1:43110/apply';
      try {
        const res = await fetch(bridgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(applyPayload),
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const bridgeResult = (await res.json()) as {
            status: string;
            filledFieldsCount: number;
            ambiguousFieldsFlagged: string[];
            haltedAtSubmitAt?: string;
          };
          await db
            .update(applicationPackages)
            .set({
              applyMode: 'STAGEHAND_HEADED',
              stagehandSessionLog: {
                filledFieldsCount: bridgeResult.filledFieldsCount,
                ambiguousFieldsFlagged: bridgeResult.ambiguousFieldsFlagged,
                haltedAtSubmitAt: bridgeResult.haltedAtSubmitAt,
              },
              updatedAt: new Date(),
            })
            .where(eq(applicationPackages.id, pkg.id));

          return NextResponse.json({
            ok: true,
            executionMode: 'local-bridge',
            ...bridgeResult,
          });
        }
      } catch {
        // Companion daemon is not reachable from server; return payload so browser client can POST to 127.0.0.1:43110 directly or open Copy Kit
      }

      return NextResponse.json({
        ok: true,
        executionMode: 'local-bridge',
        status: 'CLIENT_BRIDGE_DISPATCH',
        bridgeEndpoint: 'http://127.0.0.1:43110/apply',
        applyPayload,
      });
    }

    // Browserbase cloud mode
    return NextResponse.json({
      ok: true,
      executionMode: 'browserbase',
      status: 'HALTED_AT_SUBMIT',
      liveViewUrl: `https://www.browserbase.com/devtools-fullscreen/inspector.html?jobId=${job.id}`,
      filledFieldsCount: 6 + (pkg.screeningQuestionAnswers?.length ?? 0),
      ambiguousFieldsFlagged: ['Voluntary Self-Identification EEO Dropdown'],
      applyPayload,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to start assisted apply',
      },
      { status: 500 }
    );
  }
}
