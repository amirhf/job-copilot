import { createHash } from 'node:crypto';
import {
  db,
  eq,
  jobPostings,
  fitEvaluations,
  type NormalizedJobPosting,
  type JobPostingSourceEntry,
  type Database,
} from '@job-copilot/db';
import type { Stage1KnockoutReason } from '@job-copilot/agents';
import type { RawDiscoveredJob } from '../connectors/types';
import { detectAtsPlatformFromUrl } from '../connectors/serpapi-google-jobs';

export function normalizeCompanyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|technologies|labs|ai|co\.?)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function normalizeJobTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\bsr\.?\b/g, 'senior')
    .replace(/\bjr\.?\b/g, 'junior')
    .replace(/\bswe\b/g, 'software engineer')
    .replace(/\bfull[- ]stack\b/g, 'fullstack')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferRawLocationBucket(locationRaw: string): string {
  const lower = locationRaw.toLowerCase().trim();
  if (lower.includes('remote')) {
    if (lower.includes('global') || lower.includes('worldwide') || lower.includes('anywhere')) {
      return 'global-remote';
    }
    return 'us-remote';
  }
  if (
    lower.includes('san francisco') ||
    lower.includes('bay area') ||
    lower.includes('palo alto') ||
    lower.includes('mountain view')
  ) {
    return 'sf-bay-area';
  }
  if (lower.includes('new york') || lower.includes('nyc')) return 'nyc';
  if (lower.includes('seattle')) return 'seattle';
  if (lower.includes('austin')) return 'austin';
  if (lower.includes('london')) return 'london';
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unspecified';
}

export function computeDedupFingerprint(
  companyName: string,
  title: string,
  locationBucket: string
): {
  normalizedCompanyName: string;
  normalizedTitle: string;
  normalizedBucket: string;
  dedupFingerprint: string;
} {
  const normalizedCompanyName = normalizeCompanyName(companyName);
  const normalizedTitle = normalizeJobTitle(title);
  const normalizedBucket = locationBucket.toLowerCase().trim();

  const dedupFingerprint = createHash('sha256')
    .update(`${normalizedCompanyName}::${normalizedTitle}::${normalizedBucket}`)
    .digest('hex');

  return {
    normalizedCompanyName,
    normalizedTitle,
    normalizedBucket,
    dedupFingerprint,
  };
}

export function mergeJobSources(
  existing: JobPostingSourceEntry[],
  incoming: JobPostingSourceEntry
): JobPostingSourceEntry[] {
  const exists = existing.some(
    (s) => s.sourceUrl === incoming.sourceUrl && s.connector === incoming.connector
  );
  return exists ? existing : [...existing, incoming];
}

/**
 * Step 1 of the Cost Funnel:
 * Checks whether a raw discovered job matches an already-ingested job by fingerprint before running
 * any form inspection or Tier 1 LLM normalization.
 */
export async function checkOrMergeRawDuplicate(
  rawJob: RawDiscoveredJob,
  database: Database = db
): Promise<{ matchedJobId: string | null; alreadyScored: boolean }> {
  const bucket = inferRawLocationBucket(rawJob.locationRaw);
  const { dedupFingerprint } = computeDedupFingerprint(
    rawJob.companyNameRaw,
    rawJob.titleRaw,
    bucket
  );

  const existing = await database.query.jobPostings.findFirst({
    where: (jp, { eq: eqOp }) => eqOp(jp.dedupFingerprint, dedupFingerprint),
    with: { fitEvaluation: true },
  });

  if (!existing) {
    return { matchedJobId: null, alreadyScored: false };
  }

  const incomingSource: JobPostingSourceEntry = {
    connector: rawJob.connector,
    sourceUrl: rawJob.sourceUrl,
    externalId: rawJob.externalId,
    discoveredAt: new Date().toISOString(),
  };

  const updatedSources = mergeJobSources(existing.sources, incomingSource);
  const incomingPlatform =
    rawJob.atsPlatformHint ?? detectAtsPlatformFromUrl(rawJob.applicationUrl);
  const shouldUpgradeUrl =
    existing.atsPlatform === 'CUSTOM' && incomingPlatform !== 'CUSTOM';

  await database
    .update(jobPostings)
    .set({
      sources: updatedSources,
      applicationUrl: shouldUpgradeUrl ? rawJob.applicationUrl : existing.applicationUrl,
      atsPlatform: shouldUpgradeUrl ? incomingPlatform : existing.atsPlatform,
      updatedAt: new Date(),
    })
    .where(eq(jobPostings.id, existing.id));

  return {
    matchedJobId: existing.id,
    alreadyScored: Boolean(existing.fitEvaluation) || existing.status !== 'INGESTED',
  };
}

export async function persistRawFilteredOutJob(
  rawJob: RawDiscoveredJob,
  knockoutReasons: Stage1KnockoutReason[],
  database: Database = db
): Promise<string> {
  const bucket = inferRawLocationBucket(rawJob.locationRaw);
  const { normalizedCompanyName, normalizedTitle, dedupFingerprint } =
    computeDedupFingerprint(rawJob.companyNameRaw, rawJob.titleRaw, bucket);

  return await database.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(jobPostings)
      .values({
        dedupFingerprint,
        companyName: rawJob.companyNameRaw,
        normalizedCompanyName,
        title: rawJob.titleRaw,
        normalizedTitle,
        locationRaw: rawJob.locationRaw,
        locationBucket: bucket,
        applicationUrl: rawJob.applicationUrl,
        atsPlatform:
          rawJob.atsPlatformHint ?? detectAtsPlatformFromUrl(rawJob.applicationUrl),
        sources: [
          {
            connector: rawJob.connector,
            sourceUrl: rawJob.sourceUrl,
            externalId: rawJob.externalId,
            discoveredAt: new Date().toISOString(),
          },
        ],
        rawDescriptionHtml: rawJob.descriptionHtmlOrText,
        cleanDescriptionMarkdown: rawJob.descriptionHtmlOrText || rawJob.titleRaw,
        status: 'FILTERED_OUT',
      })
      .onConflictDoUpdate({
        target: jobPostings.dedupFingerprint,
        set: { updatedAt: new Date() },
      })
      .returning();

    if (!inserted) throw new Error('Failed to persist filtered out job');

    await tx
      .insert(fitEvaluations)
      .values({
        jobPostingId: inserted.id,
        stage1Passed: false,
        stage1KnockoutReasons: knockoutReasons,
        overallScore: null,
        hasUnresolvedCriticalGap: false,
      })
      .onConflictDoNothing();

    return inserted.id;
  });
}

export async function upsertDeduplicatedJob(
  params: {
    rawJob: RawDiscoveredJob;
    normalized: NormalizedJobPosting;
  },
  database: Database = db
): Promise<{ jobId: string; shouldScore: boolean }> {
  const { rawJob, normalized } = params;
  const { normalizedCompanyName, normalizedTitle, normalizedBucket, dedupFingerprint } =
    computeDedupFingerprint(
      normalized.companyName,
      normalized.title,
      normalized.locationBucket
    );

  const incomingSource: JobPostingSourceEntry = {
    connector: rawJob.connector,
    sourceUrl: rawJob.sourceUrl,
    externalId: rawJob.externalId,
    discoveredAt: new Date().toISOString(),
  };

  const existing = await database.query.jobPostings.findFirst({
    where: (jp, { eq: eqOp }) => eqOp(jp.dedupFingerprint, dedupFingerprint),
    with: { fitEvaluation: true },
  });

  if (existing) {
    const mergedSources = mergeJobSources(existing.sources, incomingSource);
    const incomingPlatform =
      rawJob.atsPlatformHint ?? detectAtsPlatformFromUrl(rawJob.applicationUrl);
    const shouldUpgradeUrl =
      existing.atsPlatform === 'CUSTOM' && incomingPlatform !== 'CUSTOM';

    await database
      .update(jobPostings)
      .set({
        sources: mergedSources,
        applicationUrl: shouldUpgradeUrl ? rawJob.applicationUrl : existing.applicationUrl,
        atsPlatform: shouldUpgradeUrl ? incomingPlatform : existing.atsPlatform,
        extractedQuestions:
          existing.extractedQuestions.length === 0 && normalized.extractedQuestions.length > 0
            ? normalized.extractedQuestions
            : existing.extractedQuestions,
        updatedAt: new Date(),
      })
      .where(eq(jobPostings.id, existing.id));

    return {
      jobId: existing.id,
      shouldScore: !existing.fitEvaluation && existing.status === 'INGESTED',
    };
  }

  const [inserted] = await database
    .insert(jobPostings)
    .values({
      dedupFingerprint,
      companyName: normalized.companyName,
      normalizedCompanyName,
      title: normalized.title,
      normalizedTitle,
      locationRaw: normalized.locationRaw,
      locationBucket: normalizedBucket,
      countryCode: normalized.countryCode,
      remotePolicy: normalized.remotePolicy,
      allowedUtcOffsetRange: normalized.allowedUtcOffsetRange ?? undefined,
      salaryMinUsd: normalized.salaryMinUsd,
      salaryMaxUsd: normalized.salaryMaxUsd,
      salaryRawText: rawJob.salaryRaw,
      offersVisaSponsorship: normalized.offersVisaSponsorship,
      atsPlatform:
        rawJob.atsPlatformHint ?? detectAtsPlatformFromUrl(rawJob.applicationUrl),
      applicationUrl: rawJob.applicationUrl,
      sources: [incomingSource],
      rawDescriptionHtml: rawJob.descriptionHtmlOrText,
      cleanDescriptionMarkdown: normalized.cleanDescriptionMarkdown,
      extractedRequirements: normalized.extractedRequirements,
      extractedQuestions: normalized.extractedQuestions,
      requiredAttachments: normalized.requiredAttachments,
      specialInstructions: normalized.specialInstructions,
      status: 'INGESTED',
      postedAt: rawJob.postedAt,
    })
    .returning();

  if (!inserted) throw new Error('Failed to insert deduplicated job posting');

  return {
    jobId: inserted.id,
    shouldScore: true,
  };
}
