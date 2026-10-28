import type {
  ConnectorSearchContext,
  JobIngestionConnector,
  RawDiscoveredJob,
} from './types';
import { detectAtsPlatformFromUrl } from './serpapi-google-jobs';

interface RemotiveJobItem {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

export class RemotiveConnector implements JobIngestionConnector {
  readonly id = 'REMOTIVE' as const;

  async fetchJobs(ctx: ConnectorSearchContext): Promise<RawDiscoveredJob[]> {
    const endpoint = 'https://remotive.com/api/remote-jobs?category=software-dev&limit=50';
    const response = await fetch(endpoint);
    if (!response.ok) return [];

    const payload = (await response.json()) as { jobs?: RemotiveJobItem[] };
    const jobs = payload.jobs ?? [];

    const roleKeywords = ctx.targetRoles.flatMap((r) =>
      r
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !['senior', 'staff', 'lead', 'engineer'].includes(w))
    );

    const results: RawDiscoveredJob[] = [];

    for (const job of jobs) {
      const pubDate = new Date(job.publication_date);
      if (!Number.isNaN(pubDate.getTime()) && pubDate < ctx.sinceTimestamp) {
        continue;
      }

      if (roleKeywords.length > 0) {
        const haystack = `${job.title} ${job.tags.join(' ')}`.toLowerCase();
        const matchesKeyword = roleKeywords.some((kw) => haystack.includes(kw));
        if (!matchesKeyword) continue;
      }

      results.push({
        connector: this.id,
        externalId: String(job.id),
        sourceUrl: job.url,
        applicationUrl: job.url,
        companyNameRaw: job.company_name,
        titleRaw: job.title,
        locationRaw: job.candidate_required_location || 'Remote',
        salaryRaw: job.salary || undefined,
        descriptionHtmlOrText: job.description,
        postedAt: Number.isNaN(pubDate.getTime()) ? undefined : pubDate,
        atsPlatformHint: detectAtsPlatformFromUrl(job.url),
      });

      if (results.length >= (ctx.maxResultsPerQuery ?? 25)) {
        break;
      }
    }

    return results;
  }
}
