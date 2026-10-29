import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GapResolutionItemSchema,
  executeGenerateMaterialsForJob,
} from '@job-copilot/agents';
import { getOrEnsureCandidateProfile } from '../../../../../lib/data';

const ResolveGapBodySchema = z.object({
  resolutions: z.array(GapResolutionItemSchema).min(1),
  synthesisModelTier: z
    .enum(['TIER_3_SYNTHESIS_DEFAULT', 'TIER_3_SYNTHESIS_PREMIER'])
    .optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const rawBody = await request.json();
    const parsed = ResolveGapBodySchema.parse(rawBody);
    const profile = await getOrEnsureCandidateProfile();

    const result = await executeGenerateMaterialsForJob({
      jobPostingId: jobId,
      profileId: profile.id,
      gapResolutions: parsed.resolutions,
      synthesisModelTier: parsed.synthesisModelTier,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to resolve skill gap',
      },
      { status: 400 }
    );
  }
}
