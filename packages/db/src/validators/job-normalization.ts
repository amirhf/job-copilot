import { z } from 'zod';

export const NormalizedJobPostingSchema = z.object({
  companyName: z.string(),
  title: z.string(),
  locationRaw: z.string(),
  locationBucket: z
    .string()
    .describe(
      'Canonical bucket: "us-remote", "global-remote", "sf-bay-area", "nyc", "seattle", "austin", "london", or lowercase "<city>-<country>"'
    ),
  countryCode: z.string().length(2).default('US'),
  remotePolicy: z.enum([
    'REMOTE_GLOBAL',
    'REMOTE_COUNTRY_LOCKED',
    'REMOTE_TIMEZONE_LOCKED',
    'HYBRID',
    'ONSITE',
    'UNKNOWN',
  ]),
  allowedUtcOffsetRange: z
    .object({
      min: z.number().int().min(-12).max(14).optional(),
      max: z.number().int().min(-12).max(14).optional(),
    })
    .nullable()
    .describe('Populated if posting specifies timezone bounds like "EST to PST" (-8 to -5)'),
  salaryMinUsd: z
    .number()
    .int()
    .nullable()
    .describe('Annualized base salary floor in USD; convert hourly/monthly if needed, or null if unstated'),
  salaryMaxUsd: z
    .number()
    .int()
    .nullable()
    .describe('Annualized base salary ceiling in USD, or null if unstated'),
  offersVisaSponsorship: z
    .boolean()
    .nullable()
    .describe(
      'false if posting explicitly states no sponsorship/citizenship required; true if sponsorship offered; null if unmentioned'
    ),
  cleanDescriptionMarkdown: z
    .string()
    .describe(
      'Clean Markdown of responsibilities, requirements, and company overview without boilerplate EEO footers'
    ),
  extractedRequirements: z.object({
    mustHaveSkills: z
      .array(z.string())
      .describe('Explicitly required technical skills, languages, frameworks'),
    niceToHaveSkills: z.array(z.string()).describe('Preferred or bonus skills'),
    minYearsExperience: z.number().int().nullable(),
    seniorityLevel: z.enum([
      'JUNIOR',
      'MID',
      'SENIOR',
      'STAFF_PRINCIPAL',
      'LEAD_MANAGER',
      'EXECUTIVE',
      'UNKNOWN',
    ]),
    domainKeywords: z.array(z.string()),
  }),
  extractedQuestions: z.array(
    z.object({
      questionId: z.string(),
      label: z.string(),
      fieldType: z.enum([
        'SHORT_TEXT',
        'LONG_TEXT',
        'SINGLE_SELECT',
        'MULTI_SELECT',
        'BOOLEAN',
        'NUMBER',
        'FILE_UPLOAD',
        'URL',
      ]),
      required: z.boolean(),
      options: z.array(z.string()).optional(),
      maxLength: z.number().int().optional(),
    })
  ),
  requiredAttachments: z.object({
    resume: z.boolean().default(true),
    coverLetter: z.enum(['REQUIRED', 'OPTIONAL', 'NONE']).default('OPTIONAL'),
    portfolioUrl: z.boolean().default(false),
    otherFiles: z.array(z.string()).default([]),
  }),
  specialInstructions: z
    .array(
      z.object({
        instructionType: z.enum([
          'EASTER_EGG_PHRASE',
          'COVER_LETTER_PROMPT',
          'FORMATTING_RULE',
          'SUBJECT_LINE',
        ]),
        exactRequirement: z.string(),
        sourceQuote: z
          .string()
          .describe('Verbatim quote from the job posting containing the hidden/special instruction'),
      })
    )
    .describe(
      'Captures attention-check instructions such as "Include the word giraffe in your application"'
    ),
});

export type NormalizedJobPosting = z.infer<typeof NormalizedJobPostingSchema>;
