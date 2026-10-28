import type { HardFiltersConfig, ExtractedApplicationQuestion } from '@job-copilot/db';

export type ConnectorId =
  | 'SERPAPI_GOOGLE_JOBS'
  | 'REMOTIVE'
  | 'ATS_DIRECT_SEARCH'
  | 'GMAIL_ALERT'
  | 'MANUAL_URL';

export type AtsPlatform = 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'WORKDAY' | 'CUSTOM';

export interface ConnectorSearchContext {
  profileId: string;
  targetRoles: string[];
  hardFilters: HardFiltersConfig;
  sinceTimestamp: Date;
  maxResultsPerQuery?: number;
}

export interface RawDiscoveredJob {
  connector: ConnectorId;
  externalId?: string;
  sourceUrl: string;
  applicationUrl: string;
  companyNameRaw: string;
  titleRaw: string;
  locationRaw: string;
  salaryRaw?: string;
  descriptionHtmlOrText: string;
  postedAt?: Date;
  atsPlatformHint?: AtsPlatform;
  preExtractedQuestions?: ExtractedApplicationQuestion[];
}

export interface JobIngestionConnector {
  readonly id: ConnectorId;
  fetchJobs(ctx: ConnectorSearchContext): Promise<RawDiscoveredJob[]>;
}
