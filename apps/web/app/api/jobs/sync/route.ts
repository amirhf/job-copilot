import { NextResponse } from 'next/server';
import { executeCostFunnelSync } from '@job-copilot/jobs';
import { getOrEnsureCandidateProfile } from '../../../../lib/data';

export async function POST() {
  try {
    const profile = await getOrEnsureCandidateProfile();
    const result = await executeCostFunnelSync({
      profileId: profile.id,
      sinceHours: 24,
    });

    return NextResponse.json({
      ok: true,
      fetchedCount: result.discoveredCount,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to trigger job sync',
      },
      { status: 500 }
    );
  }
}
