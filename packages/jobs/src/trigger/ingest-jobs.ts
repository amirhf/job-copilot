import { schedules, task, batch } from '@trigger.dev/sdk/v3';
import { db, type Database } from '@job-copilot/db';
import {
  evaluateStage1aRawPreFilter,
  executeIngestAndScoreJob,
} from '@job-copilot/agents';
import type { ConnectorId, JobIngestionConnector } from '../connectors/types';
import { runAllConnectors } from '../connectors/runner';
import { inspectAndNormalizeJob } from '../inspectors/form-inspector';
import {
  checkOrMergeRawDuplicate,
  persistRawFilteredOutJob,
  upsertDeduplicatedJob,
} from '../dedup/deduplicator';

export interface SyncJobSourcesPayload {
  profileId: string;
  connectors?: ConnectorId[];
  sinceHours?: number;
}

export interface SyncJobSourcesResult {
  discoveredCount: number;
  skippedDuplicateCount: number;
  stage1aFilteredOutCount: number;
  normalizedCount: number;
  scoredCount: number;
  queuedJobIds: string[];
}

/**
 * Executes the 5-Stage Cost Funnel Ingestion Pipeline:
 * 1. Fetch raw jobs from enabled connectors.
 * 2. Check raw SHA-256 fingerprint for existing scored duplicates (0 tokens, 0 extra HTTP).
 * 3. Evaluate Stage 1a raw regex pre-filter against company & title blocklists (0 tokens).
 * 4. Inspect application form (zero-browser default) & run Tier 1 LLM normalization.
 * 5. Upsert deduplicated job and dispatch to Two-Stage Fit Engine (Stage 1b + Prompt-Cached Stage 2).
 */
export async function executeCostFunnelSync(
  payload: SyncJobSourcesPayload,
  options?: {
    database?: Database;
    customConnectors?: JobIngestionConnector[];
    scoreInline?: boolean;
  }
): Promise<SyncJobSourcesResult> {
  const database = options?.database ?? db;
  const profile = await database.query.candidateProfile.findFirst({
    where: (cp, { eq }) => eq(cp.id, payload.profileId),
  });
  if (!profile) {
    throw new Error(`Candidate profile ${payload.profileId} not found`);
  }

  const sinceHours = payload.sinceHours ?? 24;
  const sinceTimestamp = new Date(Date.now() - sinceHours * 3600 * 1000);

  const rawJobs = await runAllConnectors(
    {
      profileId: profile.id,
      targetRoles: profile.targetRoles,
      hardFilters: profile.hardFilters,
      sinceTimestamp,
    },
    payload.connectors,
    options?.customConnectors
  );

  let skippedDuplicateCount = 0;
  let stage1aFilteredOutCount = 0;
  let normalizedCount = 0;
  let scoredCount = 0;
  const newlyIngestedJobIds: string[] = [];

  for (const rawJob of rawJobs) {
    // Step 1: Zero-token raw dedup check
    const existingCheck = await checkOrMergeRawDuplicate(rawJob, database);
    if (existingCheck.alreadyScored) {
      skippedDuplicateCount++;
      continue;
    }

    // Step 2: Zero-token Stage 1a raw regex pre-filter
    const stage1a = evaluateStage1aRawPreFilter(rawJob, profile.hardFilters);
    if (!stage1a.passed) {
      await persistRawFilteredOutJob(rawJob, stage1a.knockoutReasons, database);
      stage1aFilteredOutCount++;
      continue;
    }

    // Step 3: Zero-browser Form Inspection + Tier 1 LLM Normalization
    const { normalized } = await inspectAndNormalizeJob(rawJob, {
      fetchRemoteFormIfMissing: false,
    });
    normalizedCount++;

    // Step 4: Upsert Deduplicated Job
    const { jobId, shouldScore } = await upsertDeduplicatedJob(
      { rawJob, normalized },
      database
    );
    if (shouldScore) {
      newlyIngestedJobIds.push(jobId);
    }
  }

  // Step 5: Score inline (when running without Trigger.dev worker or in tests) or via Trigger.dev batch queue
  const shouldRunInline =
    options?.scoreInline ?? !Boolean(process.env.TRIGGER_SECRET_KEY);

  if (newlyIngestedJobIds.length > 0) {
    if (shouldRunInline) {
      for (const jobPostingId of newlyIngestedJobIds) {
        await executeIngestAndScoreJob({
          jobPostingId,
          profileId: profile.id,
          database,
        });
        scoredCount++;
      }
    } else {
      await batch.triggerByTask(
        newlyIngestedJobIds.map((jobPostingId) => ({
          task: scoreSingleJobTask,
          payload: { jobPostingId, profileId: profile.id },
        }))
      );
      scoredCount = newlyIngestedJobIds.length;
    }
  }

  return {
    discoveredCount: rawJobs.length,
    skippedDuplicateCount,
    stage1aFilteredOutCount,
    normalizedCount,
    scoredCount,
    queuedJobIds: newlyIngestedJobIds,
  };
}

// 1. Child Task: Score a single normalized job posting with concurrency control
export const scoreSingleJobTask = task({
  id: 'score-single-job',
  queue: {
    name: 'rubric-scoring-queue',
    concurrencyLimit: 5,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
  },
  run: async (payload: { jobPostingId: string; profileId: string }) => {
    return await executeIngestAndScoreJob(payload);
  },
});

// 2. Orchestrator Task: Manual or Scheduled Full Sync
export const syncAllJobSourcesTask = task({
  id: 'sync-all-job-sources',
  run: async (payload: SyncJobSourcesPayload) => {
    return await executeCostFunnelSync(payload, { scoreInline: false });
  },
});

// 3. Scheduled Cron: Runs twice daily at 06:00 and 18:00 America/Los_Angeles
export const dailyJobIngestionSchedule = schedules.task({
  id: 'daily-job-ingestion-schedule',
  cron: {
    pattern: '0 6,18 * * *',
    timezone: 'America/Los_Angeles',
  },
  run: async () => {
    const defaultProfile = await db.query.candidateProfile.findFirst();
    if (!defaultProfile) {
      return { skipped: true, reason: 'No candidate profile configured' };
    }

    return await executeCostFunnelSync({
      profileId: defaultProfile.id,
      sinceHours: 14,
    });
  },
});
