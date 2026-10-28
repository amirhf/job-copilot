import type {
  ConnectorSearchContext,
  JobIngestionConnector,
  RawDiscoveredJob,
  AtsPlatform,
} from './types';

interface SerpApiJobItem {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  detected_extensions?: {
    posted_at?: string;
    salary?: string;
    work_from_home?: boolean;
  };
  apply_options?: Array<{
    title?: string;
    link?: string;
  }>;
  share_link?: string;
}

export function detectAtsPlatformFromUrl(url: string): AtsPlatform {
  const lower = url.toLowerCase();
  if (lower.includes('greenhouse.io')) return 'GREENHOUSE';
  if (lower.includes('lever.co')) return 'LEVER';
  if (lower.includes('ashbyhq.com')) return 'ASHBY';
  if (lower.includes('myworkdayjobs.com') || lower.includes('workday.com')) return 'WORKDAY';
  return 'CUSTOM';
}

export function selectPreferredApplyUrl(
  applyOptions: Array<{ title?: string; link?: string }> | undefined,
  fallbackUrl: string
): { applicationUrl: string; atsPlatformHint: AtsPlatform } {
  if (!applyOptions || applyOptions.length === 0) {
    return {
      applicationUrl: fallbackUrl,
      atsPlatformHint: detectAtsPlatformFromUrl(fallbackUrl),
    };
  }

  // Prioritize direct ATS boards over job aggregators (LinkedIn, Indeed, Glassdoor, ZipRecruiter)
  const directAtsOption = applyOptions.find((opt) => {
    if (!opt.link) return false;
    const platform = detectAtsPlatformFromUrl(opt.link);
    return platform !== 'CUSTOM';
  });

  if (directAtsOption?.link) {
    return {
      applicationUrl: directAtsOption.link,
      atsPlatformHint: detectAtsPlatformFromUrl(directAtsOption.link),
    };
  }

  const nonAggregatorOption = applyOptions.find((opt) => {
    if (!opt.link) return false;
    const lower = opt.link.toLowerCase();
    return (
      !lower.includes('linkedin.com') &&
      !lower.includes('indeed.com') &&
      !lower.includes('ziprecruiter.com') &&
      !lower.includes('glassdoor.com')
    );
  });

  const chosenUrl = nonAggregatorOption?.link ?? applyOptions[0]?.link ?? fallbackUrl;
  return {
    applicationUrl: chosenUrl,
    atsPlatformHint: detectAtsPlatformFromUrl(chosenUrl),
  };
}

export class SerpApiGoogleJobsConnector implements JobIngestionConnector {
  readonly id = 'SERPAPI_GOOGLE_JOBS' as const;

  constructor(private readonly apiKey = process.env.SERPAPI_API_KEY) {}

  async fetchJobs(ctx: ConnectorSearchContext): Promise<RawDiscoveredJob[]> {
    if (!this.apiKey) return [];

    const roles = ctx.targetRoles.length > 0 ? ctx.targetRoles : ['Senior Software Engineer'];
    const allowsRemote = ctx.hardFilters.allowedRemotePolicies.some((p) =>
      p.startsWith('REMOTE')
    );
    const locationModifier = allowsRemote
      ? 'Remote'
      : (ctx.hardFilters.allowedLocations[0] ?? 'United States');

    const discovered: RawDiscoveredJob[] = [];

    for (const role of roles) {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google_jobs');
      url.searchParams.set('q', `${role} ${locationModifier}`);
      url.searchParams.set('chips', 'date_posted:3days');
      url.searchParams.set('hl', 'en');
      url.searchParams.set('gl', 'us');
      url.searchParams.set('api_key', this.apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const payload = (await response.json()) as { jobs_results?: SerpApiJobItem[] };
      const items = (payload.jobs_results ?? []).slice(0, ctx.maxResultsPerQuery ?? 15);

      for (const item of items) {
        if (!item.title || !item.company_name) continue;
        const fallbackUrl = item.share_link ?? 'https://google.com/jobs';
        const { applicationUrl, atsPlatformHint } = selectPreferredApplyUrl(
          item.apply_options,
          fallbackUrl
        );

        discovered.push({
          connector: this.id,
          externalId: item.job_id,
          sourceUrl: fallbackUrl,
          applicationUrl,
          companyNameRaw: item.company_name,
          titleRaw: item.title,
          locationRaw: item.location ?? locationModifier,
          salaryRaw: item.detected_extensions?.salary,
          descriptionHtmlOrText: item.description ?? '',
          atsPlatformHint,
        });
      }
    }

    return discovered;
  }
}
