import type { HardFiltersConfig, jobPostings } from '@job-copilot/db';
import type { InferSelectModel } from 'drizzle-orm';

export type JobPostingRow = InferSelectModel<typeof jobPostings>;

export interface Stage1KnockoutReason {
  rule:
    | 'BLACKLISTED_COMPANY'
    | 'BLACKLISTED_TITLE_KEYWORD'
    | 'BLACKLISTED_DESCRIPTION_KEYWORD'
    | 'REMOTE_POLICY_MISMATCH'
    | 'COUNTRY_NOT_ALLOWED'
    | 'LOCATION_NOT_ALLOWED'
    | 'TIMEZONE_OUTSIDE_BOUNDS'
    | 'SALARY_BELOW_FLOOR'
    | 'VISA_SPONSORSHIP_UNAVAILABLE';
  expected: string;
  actual: string;
}

export interface RawJobPreFilterCandidate {
  companyNameRaw: string;
  titleRaw: string;
  locationRaw: string;
  descriptionHtmlOrText?: string;
}

export function normalizeCompanySlugForFilter(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|technologies|labs|ai|co\.?)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Step 2 of the Cost Funnel (Stage 1a):
 * Zero-token, zero-HTTP pre-filter evaluated on raw connector output BEFORE Form Inspection or Tier 1 LLM Normalization.
 */
export function evaluateStage1aRawPreFilter(
  rawJob: RawJobPreFilterCandidate,
  filters: HardFiltersConfig
): { passed: boolean; knockoutReasons: Stage1KnockoutReason[] } {
  const reasons: Stage1KnockoutReason[] = [];

  const normCompany = normalizeCompanySlugForFilter(rawJob.companyNameRaw);
  const normalizedBlacklisted = filters.blacklistedCompanies.map(normalizeCompanySlugForFilter);
  if (normCompany && normalizedBlacklisted.includes(normCompany)) {
    reasons.push({
      rule: 'BLACKLISTED_COMPANY',
      expected: 'Not in company blocklist',
      actual: rawJob.companyNameRaw,
    });
  }

  const lowerTitle = rawJob.titleRaw.toLowerCase();
  for (const kw of filters.blacklistedTitleKeywords) {
    if (kw.trim() && lowerTitle.includes(kw.toLowerCase().trim())) {
      reasons.push({
        rule: 'BLACKLISTED_TITLE_KEYWORD',
        expected: `Title must not contain "${kw}"`,
        actual: rawJob.titleRaw,
      });
    }
  }

  if (rawJob.descriptionHtmlOrText) {
    const lowerDesc = rawJob.descriptionHtmlOrText.toLowerCase();
    for (const kw of filters.blacklistedDescriptionKeywords) {
      if (kw.trim() && lowerDesc.includes(kw.toLowerCase().trim())) {
        reasons.push({
          rule: 'BLACKLISTED_DESCRIPTION_KEYWORD',
          expected: `Description must not contain "${kw}"`,
          actual: `Matched keyword "${kw}"`,
        });
      }
    }
  }

  return {
    passed: reasons.length === 0,
    knockoutReasons: reasons,
  };
}

/**
 * Step 4 of the Cost Funnel (Stage 1b):
 * Full zero-token deterministic gate evaluated on the normalized JobPosting row.
 */
export function evaluateStage1HardFilters(
  job: Pick<
    JobPostingRow,
    | 'companyName'
    | 'normalizedCompanyName'
    | 'title'
    | 'cleanDescriptionMarkdown'
    | 'remotePolicy'
    | 'countryCode'
    | 'locationRaw'
    | 'allowedUtcOffsetRange'
    | 'salaryMinUsd'
    | 'salaryMaxUsd'
    | 'offersVisaSponsorship'
  >,
  filters: HardFiltersConfig
): { passed: boolean; knockoutReasons: Stage1KnockoutReason[] } {
  const reasons: Stage1KnockoutReason[] = [];

  // 1. Blacklisted Company
  const normalizedBlacklisted = filters.blacklistedCompanies.map(normalizeCompanySlugForFilter);
  if (
    normalizedBlacklisted.includes(job.normalizedCompanyName) ||
    normalizedBlacklisted.includes(normalizeCompanySlugForFilter(job.companyName))
  ) {
    reasons.push({
      rule: 'BLACKLISTED_COMPANY',
      expected: 'Not in company blocklist',
      actual: job.companyName,
    });
  }

  // 2. Blacklisted Title Keywords
  const lowerTitle = job.title.toLowerCase();
  for (const kw of filters.blacklistedTitleKeywords) {
    if (kw.trim() && lowerTitle.includes(kw.toLowerCase().trim())) {
      reasons.push({
        rule: 'BLACKLISTED_TITLE_KEYWORD',
        expected: `Title must not contain "${kw}"`,
        actual: job.title,
      });
    }
  }

  // 3. Blacklisted Description Keywords
  const lowerDesc = job.cleanDescriptionMarkdown.toLowerCase();
  for (const kw of filters.blacklistedDescriptionKeywords) {
    if (kw.trim() && lowerDesc.includes(kw.toLowerCase().trim())) {
      reasons.push({
        rule: 'BLACKLISTED_DESCRIPTION_KEYWORD',
        expected: `Description must not contain "${kw}"`,
        actual: `Matched keyword "${kw}"`,
      });
    }
  }

  // 4. Remote Policy & Location Check
  if (
    job.remotePolicy !== 'UNKNOWN' &&
    !filters.allowedRemotePolicies.includes(job.remotePolicy)
  ) {
    reasons.push({
      rule: 'REMOTE_POLICY_MISMATCH',
      expected: filters.allowedRemotePolicies.join(' | '),
      actual: job.remotePolicy,
    });
  }

  if (
    job.countryCode &&
    filters.allowedCountries.length > 0 &&
    job.remotePolicy !== 'REMOTE_GLOBAL' &&
    !filters.allowedCountries.includes(job.countryCode)
  ) {
    reasons.push({
      rule: 'COUNTRY_NOT_ALLOWED',
      expected: filters.allowedCountries.join(', '),
      actual: job.countryCode,
    });
  }

  if (
    (job.remotePolicy === 'HYBRID' || job.remotePolicy === 'ONSITE') &&
    filters.allowedLocations.length > 0
  ) {
    const lowerLoc = job.locationRaw.toLowerCase();
    const matchesAllowedCity = filters.allowedLocations.some((city) =>
      lowerLoc.includes(city.toLowerCase().split(',')[0]!.trim())
    );
    if (!matchesAllowedCity) {
      reasons.push({
        rule: 'LOCATION_NOT_ALLOWED',
        expected: filters.allowedLocations.join(' OR '),
        actual: job.locationRaw,
      });
    }
  }

  // 5. Timezone Overlap Check
  if (
    job.allowedUtcOffsetRange?.min !== undefined &&
    job.allowedUtcOffsetRange?.max !== undefined
  ) {
    const overlaps =
      Math.max(job.allowedUtcOffsetRange.min, filters.allowedUtcOffsetRange.min) <=
      Math.min(job.allowedUtcOffsetRange.max, filters.allowedUtcOffsetRange.max);
    if (!overlaps) {
      reasons.push({
        rule: 'TIMEZONE_OUTSIDE_BOUNDS',
        expected: `UTC ${filters.allowedUtcOffsetRange.min} to ${filters.allowedUtcOffsetRange.max}`,
        actual: `UTC ${job.allowedUtcOffsetRange.min} to ${job.allowedUtcOffsetRange.max}`,
      });
    }
  }

  // 6. Minimum Base Salary Floor
  if (filters.minBaseSalaryUsd !== null) {
    const statedCeiling = job.salaryMaxUsd ?? job.salaryMinUsd;
    if (statedCeiling === null) {
      if (!filters.allowUnlistedSalary) {
        reasons.push({
          rule: 'SALARY_BELOW_FLOOR',
          expected: `>= $${filters.minBaseSalaryUsd.toLocaleString()} (unlisted not allowed)`,
          actual: 'Salary unlisted',
        });
      }
    } else if (statedCeiling < filters.minBaseSalaryUsd) {
      reasons.push({
        rule: 'SALARY_BELOW_FLOOR',
        expected: `>= $${filters.minBaseSalaryUsd.toLocaleString()}`,
        actual: `Max stated: $${statedCeiling.toLocaleString()}`,
      });
    }
  }

  // 7. Visa Sponsorship Requirement
  if (filters.requiresVisaSponsorship && job.offersVisaSponsorship === false) {
    reasons.push({
      rule: 'VISA_SPONSORSHIP_UNAVAILABLE',
      expected: 'Visa sponsorship available',
      actual: 'Posting explicitly states no visa sponsorship',
    });
  }

  return {
    passed: reasons.length === 0,
    knockoutReasons: reasons,
  };
}
