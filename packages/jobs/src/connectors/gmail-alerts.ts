import { z } from 'zod';
import { generateStructuredWithTier, stripHtmlToMarkdown } from '@job-copilot/agents';
import type {
  ConnectorSearchContext,
  JobIngestionConnector,
  RawDiscoveredJob,
} from './types';
import { detectAtsPlatformFromUrl } from './serpapi-google-jobs';

export const EmailDigestExtractionSchema = z.object({
  extractedJobs: z.array(
    z.object({
      companyName: z.string(),
      jobTitle: z.string(),
      locationHint: z.string().default('Remote / Unspecified'),
      salaryHint: z.string().optional(),
      rawApplyUrl: z.string().url(),
      summarySnippet: z.string(),
    })
  ),
});

export type EmailDigestExtraction = z.infer<typeof EmailDigestExtractionSchema>;

export async function splitAlertEmailDigestIntoJobs(params: {
  emailSubject: string;
  emailHtmlBody: string;
}): Promise<RawDiscoveredJob[]> {
  const cleanTextWithLinks = stripHtmlToMarkdown(params.emailHtmlBody);
  if (!cleanTextWithLinks) return [];

  const { object } = await generateStructuredWithTier({
    tier: 'TIER_1_INGESTION',
    schema: EmailDigestExtractionSchema,
    systemPrompt:
      'You are a Job Alert Email Digest Parser. Extract every distinct job posting and its apply URL from the alert email markdown.',
    userPrompt: `Subject: ${params.emailSubject}\n\nBody:\n${cleanTextWithLinks}`,
  });

  return object.extractedJobs.map((item) => ({
    connector: 'GMAIL_ALERT' as const,
    sourceUrl: item.rawApplyUrl,
    applicationUrl: item.rawApplyUrl,
    companyNameRaw: item.companyName,
    titleRaw: item.jobTitle,
    locationRaw: item.locationHint,
    salaryRaw: item.salaryHint,
    descriptionHtmlOrText: item.summarySnippet,
    atsPlatformHint: detectAtsPlatformFromUrl(item.rawApplyUrl),
  }));
}

export class GmailAlertsConnector implements JobIngestionConnector {
  readonly id = 'GMAIL_ALERT' as const;

  async fetchJobs(_ctx: ConnectorSearchContext): Promise<RawDiscoveredJob[]> {
    // When GMAIL_REFRESH_TOKEN is not configured, returns an empty list gracefully
    if (!process.env.GMAIL_REFRESH_TOKEN || !process.env.GMAIL_CLIENT_ID) {
      return [];
    }
    return [];
  }
}
