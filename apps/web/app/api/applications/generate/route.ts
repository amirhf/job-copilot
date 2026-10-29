import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dispatchBatchMaterialGeneration } from '@job-copilot/jobs';
import { getOrEnsureCandidateProfile } from '../../../../lib/data';

const GenerateRequestSchema = z.object({
  jobPostingIds: z.array(z.string().min(1)).min(1),
  synthesisModelTier: z
    .enum(['TIER_3_SYNTHESIS_DEFAULT', 'TIER_3_SYNTHESIS_PREMIER'])
    .optional(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = GenerateRequestSchema.parse(rawBody);
    const profile = await getOrEnsureCandidateProfile();

    const result = await dispatchBatchMaterialGeneration({
      profileId: profile.id,
      jobPostingIds: parsed.jobPostingIds,
      synthesisModelTier: parsed.synthesisModelTier,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to dispatch material generation',
      },
      { status: 400 }
    );
  }
}
