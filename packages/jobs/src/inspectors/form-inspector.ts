import { parseHTML } from 'linkedom';
import {
  NormalizedJobPostingSchema,
  type NormalizedJobPosting,
  type ExtractedApplicationQuestion,
} from '@job-copilot/db';
import { generateStructuredWithTier, stripHtmlToMarkdown } from '@job-copilot/agents';
import type { RawDiscoveredJob } from '../connectors/types';
import {
  fetchNativeAtsPostingDetails,
  hashQuestionLabel,
  isStandardIdentityOrEeoQuestion,
} from '../connectors/ats-search';

interface MinimalDomElement {
  tagName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  closest(selector: string): MinimalDomElement | null;
  querySelectorAll(selector: string): Iterable<MinimalDomElement>;
}

/**
 * Extracts custom screening questions directly from raw HTML `<form>` DOM using `linkedom`
 * (Zero-browser default: <128MB RAM, <15ms parse time).
 */
export function extractCustomQuestionsFromHtmlDom(
  html: string
): ExtractedApplicationQuestion[] {
  if (!html || !html.includes('<')) return [];

  const { document } = parseHTML(html);
  const questions: ExtractedApplicationQuestion[] = [];
  const seenIds = new Set<string>();

  const formControls = document.querySelectorAll(
    'input, textarea, select'
  ) as unknown as Iterable<MinimalDomElement>;
  for (const el of Array.from(formControls)) {
    const tagName = el.tagName.toLowerCase();
    const inputType = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'password'].includes(inputType)) {
      continue;
    }

    const nameAttr = el.getAttribute('name') ?? '';
    const idAttr = el.getAttribute('id') ?? '';
    const ariaLabel = el.getAttribute('aria-label') ?? '';

    let labelText = ariaLabel.trim();
    if (!labelText && idAttr) {
      const explicitLabel = document.querySelector(
        `label[for="${idAttr}"]`
      ) as unknown as MinimalDomElement | null;
      if (explicitLabel?.textContent) {
        labelText = explicitLabel.textContent.trim();
      }
    }
    if (!labelText) {
      const parentLabel = el.closest('label');
      if (parentLabel?.textContent) {
        labelText = parentLabel.textContent.trim();
      }
    }

    labelText = labelText.replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!labelText || isStandardIdentityOrEeoQuestion(labelText, nameAttr)) {
      continue;
    }

    const questionId = hashQuestionLabel(labelText);
    if (seenIds.has(questionId)) continue;
    seenIds.add(questionId);

    let fieldType: ExtractedApplicationQuestion['fieldType'] = 'SHORT_TEXT';
    let options: string[] | undefined;

    if (tagName === 'textarea') {
      fieldType = 'LONG_TEXT';
    } else if (tagName === 'select') {
      fieldType = el.hasAttribute('multiple') ? 'MULTI_SELECT' : 'SINGLE_SELECT';
      options = Array.from(el.querySelectorAll('option'))
        .map((opt) => (opt.textContent ?? '').trim())
        .filter((txt) => txt.length > 0 && !/^select\b/i.test(txt));
    } else if (inputType === 'file') {
      fieldType = 'FILE_UPLOAD';
    } else if (inputType === 'number') {
      fieldType = 'NUMBER';
    } else if (inputType === 'url') {
      fieldType = 'URL';
    } else if (inputType === 'checkbox') {
      fieldType = 'BOOLEAN';
    }

    const required =
      el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
    const maxLengthRaw = el.getAttribute('maxlength');
    const maxLength = maxLengthRaw ? Number.parseInt(maxLengthRaw, 10) : undefined;

    questions.push({
      questionId,
      label: labelText,
      fieldType,
      required,
      options: options && options.length > 0 ? options : undefined,
      maxLength: Number.isNaN(maxLength) ? undefined : maxLength,
    });
  }

  return questions;
}

export const JOB_NORMALIZATION_SYSTEM_PROMPT = `You are the **Tier 1 Job Normalization & Attention-Check Inspector** for the Agentic Job Application Copilot.
Convert raw job posting text/HTML and pre-extracted form controls into a clean \`NormalizedJobPostingSchema\` object.

### NORMALIZATION RULES
1. **Location Bucket Canonicalization:**
   - Map remote US roles to \`"us-remote"\`, worldwide remote roles to \`"global-remote"\`, Bay Area roles to \`"sf-bay-area"\`, New York roles to \`"nyc"\`, or \`"<city>-<country>"\`.
2. **Compensation Annualization:**
   - Convert stated base salary ranges to annual USD integers (\`salaryMinUsd\`, \`salaryMaxUsd\`). If unstated, set both to \`null\`.
3. **Special / Easter-Egg Instruction Detection (\`specialInstructions\`):**
   - Carefully scan the posting for hidden attention-check prompts (e.g., "Include the word 'banana' in your cover letter", "Send a link to a proud commit in Q3"). Record the verbatim quote in \`sourceQuote\`.`;

export async function inspectAndNormalizeJob(
  rawJob: RawDiscoveredJob,
  options?: { fetchRemoteFormIfMissing?: boolean }
): Promise<{
  rawJob: RawDiscoveredJob;
  normalized: NormalizedJobPosting;
  modelUsed: string;
}> {
  let preExtractedQuestions = rawJob.preExtractedQuestions ?? [];
  let descriptionSource = rawJob.descriptionHtmlOrText;

  // Try Native ATS JSON Fast-Path if questions were not already pre-extracted
  if (preExtractedQuestions.length === 0 && options?.fetchRemoteFormIfMissing !== false) {
    const atsDetails = await fetchNativeAtsPostingDetails(rawJob.applicationUrl).catch(
      () => null
    );
    if (atsDetails) {
      if (atsDetails.questions.length > 0) {
        preExtractedQuestions = atsDetails.questions;
      }
      if (!descriptionSource && atsDetails.descriptionHtml) {
        descriptionSource = atsDetails.descriptionHtml;
      }
    }
  }

  // Fallback to in-memory linkedom HTML form extraction if HTML contains form tags
  if (preExtractedQuestions.length === 0 && descriptionSource.includes('<form')) {
    preExtractedQuestions = extractCustomQuestionsFromHtmlDom(descriptionSource);
  }

  const cleanMarkdown = stripHtmlToMarkdown(descriptionSource || rawJob.titleRaw);

  const userPrompt = [
    `Company Raw: ${rawJob.companyNameRaw}`,
    `Title Raw: ${rawJob.titleRaw}`,
    `Location Raw: ${rawJob.locationRaw}`,
    `Salary Raw: ${rawJob.salaryRaw ?? 'Unstated'}`,
    `Application URL: ${rawJob.applicationUrl}`,
    `Pre-Extracted Form Questions: ${JSON.stringify(preExtractedQuestions)}`,
    `--- JOB DESCRIPTION ---`,
    cleanMarkdown,
  ].join('\n');

  const { object, modelUsed } = await generateStructuredWithTier({
    tier: 'TIER_1_INGESTION',
    schema: NormalizedJobPostingSchema,
    systemPrompt: JOB_NORMALIZATION_SYSTEM_PROMPT,
    userPrompt,
  });

  // Merge pre-extracted form questions with any questions discovered by the LLM
  const mergedQuestionsMap = new Map<string, ExtractedApplicationQuestion>();
  for (const q of preExtractedQuestions) {
    mergedQuestionsMap.set(q.questionId, q);
  }
  for (const q of object.extractedQuestions) {
    if (!mergedQuestionsMap.has(q.questionId)) {
      mergedQuestionsMap.set(q.questionId, q);
    }
  }

  return {
    rawJob,
    normalized: {
      ...object,
      extractedQuestions: Array.from(mergedQuestionsMap.values()),
    },
    modelUsed,
  };
}
