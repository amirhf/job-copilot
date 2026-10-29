import { task, batch } from '@trigger.dev/sdk/v3';
import {
  executeGenerateMaterialsForJob,
  type GenerateMaterialsWorkflowResult,
  type GapResolutionItem,
} from '@job-copilot/agents';

export interface GenerateApplicationPackagePayload {
  jobPostingId: string;
  profileId: string;
  synthesisModelTier?: 'TIER_3_SYNTHESIS_DEFAULT' | 'TIER_3_SYNTHESIS_PREMIER';
  gapResolutions?: GapResolutionItem[];
}

export const generateApplicationPackageTask = task({
  id: 'generate-application-package',
  queue: {
    name: 'material-synthesis-queue',
    concurrencyLimit: 3,
  },
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 3000,
  },
  run: async (
    payload: GenerateApplicationPackagePayload
  ): Promise<GenerateMaterialsWorkflowResult> => {
    return await executeGenerateMaterialsForJob(payload);
  },
});

export type DispatchBatchMaterialGenerationResult =
  | { mode: 'inline'; results: GenerateMaterialsWorkflowResult[] }
  | { mode: 'trigger-batch'; batchId: string };

export async function dispatchBatchMaterialGeneration(params: {
  profileId: string;
  jobPostingIds: string[];
  synthesisModelTier?: 'TIER_3_SYNTHESIS_DEFAULT' | 'TIER_3_SYNTHESIS_PREMIER';
  runInline?: boolean;
}): Promise<DispatchBatchMaterialGenerationResult> {
  const shouldRunInline =
    params.runInline ?? !Boolean(process.env.TRIGGER_SECRET_KEY);

  if (shouldRunInline) {
    const results: GenerateMaterialsWorkflowResult[] = [];
    for (const jobPostingId of params.jobPostingIds) {
      const res = await executeGenerateMaterialsForJob({
        jobPostingId,
        profileId: params.profileId,
        synthesisModelTier: params.synthesisModelTier,
      });
      results.push(res);
    }
    return { mode: 'inline', results };
  }

  const handle = await batch.triggerByTask(
    params.jobPostingIds.map((jobPostingId) => ({
      task: generateApplicationPackageTask,
      payload: {
        jobPostingId,
        profileId: params.profileId,
        synthesisModelTier: params.synthesisModelTier,
      },
    }))
  );

  return { mode: 'trigger-batch', batchId: handle.batchId };
}
