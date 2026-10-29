import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  AssistedApplyPayload,
  FieldFillReport,
  StagehandInstanceLike,
} from '../types';

export interface AdapterOptions {
  resumeUploadSettleDelayMs?: number;
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

export function detectAuthWallInHtml(html: string): boolean {
  const lower = html.toLowerCase();
  const hasLoginGate =
    /\b(sign in to apply|log in to apply|create an account to apply|workday login)\b/i.test(
      lower
    ) && !lower.includes('type="file"');
  return hasLoginGate;
}

export function materializePdfFilesToTemp(payload: AssistedApplyPayload): {
  resumeFilePath: string | null;
  coverLetterFilePath: string | null;
} {
  const tmpDir = path.join(os.tmpdir(), 'job-copilot-apply', payload.jobPosting.id);
  mkdirSync(tmpDir, { recursive: true });

  let resumeFilePath = payload.applicationPackage.compiledResumePdfPath ?? null;
  if (!resumeFilePath && payload.applicationPackage.compiledResumePdfBase64) {
    resumeFilePath = path.join(tmpDir, 'Resume.pdf');
    writeFileSync(
      resumeFilePath,
      Buffer.from(payload.applicationPackage.compiledResumePdfBase64, 'base64')
    );
  }

  let coverLetterFilePath =
    payload.applicationPackage.compiledCoverLetterPdfPath ?? null;
  if (
    !coverLetterFilePath &&
    payload.applicationPackage.compiledCoverLetterPdfBase64
  ) {
    coverLetterFilePath = path.join(tmpDir, 'CoverLetter.pdf');
    writeFileSync(
      coverLetterFilePath,
      Buffer.from(payload.applicationPackage.compiledCoverLetterPdfBase64, 'base64')
    );
  }

  return { resumeFilePath, coverLetterFilePath };
}

export abstract class BaseAtsAdapter {
  public abstract readonly adapterName: string;

  constructor(
    protected readonly stagehand: StagehandInstanceLike,
    protected readonly options: AdapterOptions = {}
  ) {}

  protected abstract getIdentityFieldSelectors(
    payload: AssistedApplyPayload
  ): Array<{ label: string; selectors: string[]; value: string | null | undefined }>;

  public async preFillApplication(
    payload: AssistedApplyPayload
  ): Promise<FieldFillReport> {
    const operationOrder: string[] = [];
    const filledFields: string[] = [];
    const ambiguousFields: string[] = [];

    const pageHtml = await this.stagehand.page.content();
    if (detectAuthWallInHtml(pageHtml)) {
      return {
        operationOrder,
        filledFields,
        ambiguousFields,
        fallbackRequired: true,
        fallbackReason: 'AUTH_WALL_DETECTED',
      };
    }

    const { resumeFilePath, coverLetterFilePath } =
      materializePdfFilesToTemp(payload);

    // 1. RESUME-FIRST UPLOAD INVARIANT:
    // Always upload Resume.pdf first and wait for any client-side ATS auto-parser to settle
    // before filling text inputs so the portal never overwrites our verified identity/Q&A fields.
    if (resumeFilePath) {
      const fileLocator = this.stagehand.page.locator('input[type="file"]').first();
      const count = await fileLocator.count();
      if (count > 0) {
        await fileLocator.setInputFiles(resumeFilePath);
        operationOrder.push('UPLOAD_RESUME_PDF');
        filledFields.push('Resume PDF');
        const settleMs = this.options.resumeUploadSettleDelayMs ?? 1500;
        if (settleMs > 0) {
          await new Promise((r) => setTimeout(r, settleMs));
        }
      }
    }

    if (coverLetterFilePath) {
      const coverLocator = this.stagehand.page.locator(
        'input[type="file"][name*="cover" i], input[type="file"][id*="cover" i]'
      );
      const count = await coverLocator.count();
      if (count > 0) {
        await coverLocator.first().setInputFiles(coverLetterFilePath);
        operationOrder.push('UPLOAD_COVER_LETTER_PDF');
        filledFields.push('Cover Letter PDF');
      }
    }

    // 2. STANDARD IDENTITY & LINKS MAPPING:
    const identityMappings = this.getIdentityFieldSelectors(payload);
    for (const item of identityMappings) {
      if (!item.value) continue;
      let filledViaSelector = false;

      for (const selector of item.selectors) {
        const loc = this.stagehand.page.locator(selector);
        if ((await loc.count()) > 0) {
          await loc.first().fill(item.value);
          filledViaSelector = true;
          break;
        }
      }

      if (!filledViaSelector) {
        await this.stagehand.act({
          action:
            'Fill the form input for %fieldLabel% with %fieldValue%. Do not click any submit button.',
          variables: {
            fieldLabel: item.label,
            fieldValue: item.value,
          },
        });
      }

      operationOrder.push(`FILL_IDENTITY:${item.label}`);
      filledFields.push(item.label);
    }

    // 3. CUSTOM SCREENING QUESTION POPULATION:
    for (const qa of payload.applicationPackage.screeningQuestionAnswers) {
      const answerValue = (qa.userEditedAnswer ?? qa.draftedAnswer).trim();
      if (!answerValue) continue;

      await this.stagehand.act({
        action:
          'Fill the application form field labeled %questionLabel% with the exact value %answerValue%. Do not click any submit or finish button.',
        variables: {
          questionLabel: qa.questionLabel,
          answerValue,
        },
      });

      operationOrder.push(`FILL_SCREENING_QA:${qa.questionId}`);
      filledFields.push(`Q&A: ${qa.questionLabel}`);
    }

    // 4. DETECT AMBIGUOUS / VOLUNTARY EEO / CAPTCHA FIELDS FOR MANUAL REVIEW:
    if (/gender|hispanic|veteran|disability|eeo/i.test(pageHtml)) {
      ambiguousFields.push('Voluntary EEO Self-Identification');
    }
    if (/recaptcha|hcaptcha|turnstile/i.test(pageHtml)) {
      ambiguousFields.push('Captcha Verification Challenge');
    }

    return {
      operationOrder,
      filledFields,
      ambiguousFields,
    };
  }
}
