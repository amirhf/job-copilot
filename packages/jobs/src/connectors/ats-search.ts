import { createHash } from 'node:crypto';
import type { ExtractedApplicationQuestion } from '@job-copilot/db';
import type {
  ConnectorSearchContext,
  JobIngestionConnector,
  RawDiscoveredJob,
} from './types';

const STANDARD_IDENTITY_FIELD_NAMES = new Set([
  'first_name',
  'lastname',
  'last_name',
  'firstname',
  'full_name',
  'name',
  'email',
  'phone',
  'resume',
  'resume_text',
  'cover_letter',
  'cover_letter_text',
  'linkedin_profile',
  'linkedin',
  'github',
  'website',
  'portfolio',
]);

export function hashQuestionLabel(label: string): string {
  return (
    'q_' +
    createHash('sha256').update(label.trim().toLowerCase()).digest('hex').slice(0, 12)
  );
}

export function isStandardIdentityOrEeoQuestion(label: string, fieldName = ''): boolean {
  const normField = fieldName.toLowerCase().trim();
  if (STANDARD_IDENTITY_FIELD_NAMES.has(normField)) return true;

  const lower = label.toLowerCase().trim();
  if (
    /^(first name|last name|full name|email|email address|phone|phone number|resume\/cv|resume|cv|attach resume)$/i.test(
      lower
    )
  ) {
    return true;
  }

  // Filter out standard US EEO / demographic self-identification questions
  if (
    lower.includes('gender identity') ||
    lower.includes('hispanic or latino') ||
    lower.includes('veteran status') ||
    lower.includes('disability status') ||
    lower.includes('equal employment opportunity') ||
    lower.includes('race/ethnicity')
  ) {
    return true;
  }

  return false;
}

export interface ParsedAtsUrl {
  platform: 'GREENHOUSE' | 'LEVER' | 'ASHBY';
  companyOrBoardToken: string;
  jobId: string;
}

export function parseAtsJobUrl(url: string): ParsedAtsUrl | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);

    // Greenhouse: https://boards.greenhouse.io/{token}/jobs/{id} or https://job-boards.greenhouse.io/{token}/jobs/{id}
    if (host.includes('greenhouse.io')) {
      const jobsIdx = segments.indexOf('jobs');
      if (jobsIdx >= 1 && segments[jobsIdx + 1]) {
        return {
          platform: 'GREENHOUSE',
          companyOrBoardToken: segments[jobsIdx - 1]!,
          jobId: segments[jobsIdx + 1]!,
        };
      }
    }

    // Lever: https://jobs.lever.co/{company}/{jobId}
    if (host === 'jobs.lever.co' && segments.length >= 2) {
      return {
        platform: 'LEVER',
        companyOrBoardToken: segments[0]!,
        jobId: segments[1]!.replace(/\/apply$/, ''),
      };
    }

    // Ashby: https://jobs.ashbyhq.com/{company}/{jobId}
    if (host === 'jobs.ashbyhq.com' && segments.length >= 2) {
      return {
        platform: 'ASHBY',
        companyOrBoardToken: segments[0]!,
        jobId: segments[1]!.replace(/\/application$/, ''),
      };
    }

    return null;
  } catch {
    return null;
  }
}

interface GreenhouseQuestionField {
  name?: string;
  type?: string;
  values?: Array<{ label?: string; value?: number | string }>;
}

interface GreenhouseQuestion {
  label?: string;
  required?: boolean;
  fields?: GreenhouseQuestionField[];
}

export function mapGreenhouseQuestions(
  rawQuestions: GreenhouseQuestion[] | undefined
): ExtractedApplicationQuestion[] {
  if (!rawQuestions) return [];
  const extracted: ExtractedApplicationQuestion[] = [];

  for (const q of rawQuestions) {
    const label = q.label?.trim();
    if (!label) continue;
    const primaryField = q.fields?.[0];
    if (isStandardIdentityOrEeoQuestion(label, primaryField?.name)) {
      continue;
    }

    const rawType = primaryField?.type ?? 'input_text';
    let fieldType: ExtractedApplicationQuestion['fieldType'] = 'SHORT_TEXT';
    if (rawType === 'textarea') fieldType = 'LONG_TEXT';
    else if (rawType === 'multi_value_single_select') fieldType = 'SINGLE_SELECT';
    else if (rawType === 'multi_value_multi_select') fieldType = 'MULTI_SELECT';
    else if (rawType === 'input_file') fieldType = 'FILE_UPLOAD';

    const options = primaryField?.values
      ?.map((v) => v.label)
      .filter((v): v is string => Boolean(v));

    extracted.push({
      questionId: hashQuestionLabel(label),
      label,
      fieldType,
      required: Boolean(q.required),
      options: options && options.length > 0 ? options : undefined,
    });
  }

  return extracted;
}

/**
 * Queries the public JSON API for Greenhouse or Lever directly (0 browser overhead, <300ms).
 */
export async function fetchNativeAtsPostingDetails(url: string): Promise<{
  title?: string;
  companyName?: string;
  locationRaw?: string;
  descriptionHtml?: string;
  questions: ExtractedApplicationQuestion[];
} | null> {
  const parsed = parseAtsJobUrl(url);
  if (!parsed) return null;

  if (parsed.platform === 'GREENHOUSE') {
    const endpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
      parsed.companyOrBoardToken
    )}/jobs/${encodeURIComponent(parsed.jobId)}?questions=true`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      title?: string;
      company_name?: string;
      location?: { name?: string };
      content?: string;
      questions?: GreenhouseQuestion[];
    };

    return {
      title: data.title,
      companyName: data.company_name ?? parsed.companyOrBoardToken,
      locationRaw: data.location?.name,
      descriptionHtml: data.content,
      questions: mapGreenhouseQuestions(data.questions),
    };
  }

  if (parsed.platform === 'LEVER') {
    const endpoint = `https://api.lever.co/v0/postings/${encodeURIComponent(
      parsed.companyOrBoardToken
    )}/${encodeURIComponent(parsed.jobId)}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      text?: string;
      categories?: { location?: string };
      description?: string;
      lists?: Array<{ text?: string; content?: string }>;
    };

    const listsHtml = (data.lists ?? [])
      .map((l) => `<h3>${l.text ?? ''}</h3><ul>${l.content ?? ''}</ul>`)
      .join('\n');

    return {
      title: data.text,
      companyName: parsed.companyOrBoardToken,
      locationRaw: data.categories?.location,
      descriptionHtml: `${data.description ?? ''}\n${listsHtml}`,
      questions: [],
    };
  }

  return null;
}

export class AtsDirectSearchConnector implements JobIngestionConnector {
  readonly id = 'ATS_DIRECT_SEARCH' as const;

  constructor(private readonly serpApiKey = process.env.SERPAPI_API_KEY) {}

  async fetchJobs(ctx: ConnectorSearchContext): Promise<RawDiscoveredJob[]> {
    if (!this.serpApiKey) return [];

    const roleClause =
      ctx.targetRoles.length > 0
        ? ctx.targetRoles.map((r) => `"${r}"`).join(' OR ')
        : '"Staff Software Engineer" OR "Senior Software Engineer"';

    const dorkQuery = `(site:boards.greenhouse.io OR site:job-boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com) (${roleClause})`;

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', dorkQuery);
    url.searchParams.set('tbs', 'qdr:d3'); // Past 3 days
    url.searchParams.set('num', String(ctx.maxResultsPerQuery ?? 15));
    url.searchParams.set('api_key', this.serpApiKey);

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const payload = (await res.json()) as {
      organic_results?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
      }>;
    };

    const discovered: RawDiscoveredJob[] = [];

    for (const item of payload.organic_results ?? []) {
      if (!item.link) continue;
      const parsed = parseAtsJobUrl(item.link);
      if (!parsed) continue;

      const nativeDetails = await fetchNativeAtsPostingDetails(item.link);

      discovered.push({
        connector: this.id,
        externalId: `${parsed.platform}:${parsed.companyOrBoardToken}:${parsed.jobId}`,
        sourceUrl: item.link,
        applicationUrl: item.link,
        companyNameRaw: nativeDetails?.companyName ?? parsed.companyOrBoardToken,
        titleRaw: nativeDetails?.title ?? item.title ?? 'Software Engineer',
        locationRaw: nativeDetails?.locationRaw ?? 'Remote / Unspecified',
        descriptionHtmlOrText: nativeDetails?.descriptionHtml ?? item.snippet ?? '',
        atsPlatformHint: parsed.platform,
        preExtractedQuestions: nativeDetails?.questions,
      });
    }

    return discovered;
  }
}
