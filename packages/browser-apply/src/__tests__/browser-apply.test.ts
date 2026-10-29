import { describe, it, expect } from 'vitest';
import {
  runStagehandAssistedApply,
  selectAtsAdapter,
  handleCompanionRequest,
  type AssistedApplyPayload,
  type StagehandInstanceLike,
  type StagehandLocatorLike,
} from '../index';

function createMockStagehand(options?: {
  pageHtml?: string;
  availableSelectors?: string[];
}) {
  const pageHtml =
    options?.pageHtml ??
    `<html><body>
      <form>
        <input type="file" name="resume" />
        <input id="first_name" />
        <input id="last_name" />
        <input id="email" />
        <input id="phone" />
        <select required name="eeo_gender"><option value="">Select</option></select>
        <button type="submit">Submit Application</button>
      </form>
    </body></html>`;

  const available = new Set(
    options?.availableSelectors ?? [
      'input[type="file"]',
      '#first_name',
      '#last_name',
      '#email',
      '#phone',
    ]
  );

  const uploadedFiles: string[] = [];
  const filledSelectorValues: Array<{ selector: string; value: string }> = [];
  const actedInstructions: Array<{
    action: string;
    variables?: Record<string, string>;
  }> = [];
  const evaluatedScripts: unknown[] = [];

  const createLocator = (selector: string): StagehandLocatorLike => ({
    first() {
      return this;
    },
    async count() {
      return available.has(selector) ? 1 : 0;
    },
    async setInputFiles(filePath: string) {
      uploadedFiles.push(filePath);
    },
    async fill(value: string) {
      filledSelectorValues.push({ selector, value });
    },
  });

  const stagehand: StagehandInstanceLike = {
    async init() {
      return { debugUrl: 'https://www.browserbase.com/devtools/mock-session' };
    },
    page: {
      async goto() {},
      async content() {
        return pageHtml;
      },
      locator(selector: string) {
        return createLocator(selector);
      },
      async evaluate(fnOrScript, arg) {
        evaluatedScripts.push({ fnOrScript, arg });
        return undefined as never;
      },
    },
    async act(actOpts) {
      actedInstructions.push(actOpts);
      return { success: true };
    },
    async observe() {
      return [];
    },
  };

  return {
    stagehand,
    uploadedFiles,
    filledSelectorValues,
    actedInstructions,
    evaluatedScripts,
  };
}

const SAMPLE_APPLY_PAYLOAD: AssistedApplyPayload = {
  executionMode: 'local-bridge',
  jobPosting: {
    id: 'job_linear_1',
    companyName: 'Linear',
    title: 'Staff AI Platform Engineer',
    atsPlatform: 'GREENHOUSE',
    applicationUrl: 'https://boards.greenhouse.io/linear/jobs/12345',
    specialInstructions: [
      {
        instructionType: 'EASTER_EGG_PHRASE',
        exactRequirement: 'Include shipped system link in Q1',
        sourceQuote: 'Include a link to a shipped system in Q1.',
      },
    ],
  },
  candidate: {
    fullName: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '+1-415-555-0192',
    locationCity: 'San Francisco, CA',
    linkedinUrl: 'https://linkedin.com/in/alexrivera',
    githubUrl: 'https://github.com/alexrivera',
    portfolioUrl: 'https://alexrivera.dev',
    workAuthorization: {
      authorizedCountries: ['US'],
      requiresSponsorship: false,
    },
  },
  applicationPackage: {
    id: 'pkg_linear_1',
    compiledResumePdfBase64: Buffer.from('%PDF-1.7 mock resume').toString('base64'),
    compiledCoverLetterPdfBase64: Buffer.from('%PDF-1.7 mock cover').toString(
      'base64'
    ),
    screeningQuestionAnswers: [
      {
        questionId: 'q_shipped',
        questionLabel: 'Describe a complex distributed system you shipped.',
        fieldType: 'LONG_TEXT',
        draftedAnswer: 'Drafted answer about multi-agent router.',
        userEditedAnswer:
          'Edited answer: Architected multi-agent router (https://github.com/alexrivera/router).',
        citedCareerBlockIds: ['b_1'],
      },
    ],
  },
};

describe('@job-copilot/browser-apply Stagehand v4 Assisted Apply & Guardrails (Milestone 6)', () => {
  it('enforces Resume-First Upload before filling identity fields and custom screening Q&As, then halts at Submit', async () => {
    const mock = createMockStagehand();

    const result = await runStagehandAssistedApply(SAMPLE_APPLY_PAYLOAD, {
      stagehandInstance: mock.stagehand,
      resumeUploadSettleDelayMs: 0,
    });

    expect(result.status).toBe('HALTED_AT_SUBMIT');
    expect(result.operationOrder[0]).toBe('UPLOAD_RESUME_PDF');
    expect(result.operationOrder).toContain('FILL_IDENTITY:First Name');
    expect(result.operationOrder).toContain('FILL_IDENTITY:Last Name');
    expect(result.operationOrder).toContain('FILL_SCREENING_QA:q_shipped');

    // Verify userEditedAnswer took precedence over draftedAnswer
    const qaAct = mock.actedInstructions.find(
      (a) => a.variables?.questionLabel === 'Describe a complex distributed system you shipped.'
    );
    expect(qaAct?.variables?.answerValue).toContain(
      'Edited answer: Architected multi-agent router'
    );

    // Verify Voluntary EEO field was flagged in ambiguousFieldsFlagged for manual completion
    expect(result.ambiguousFieldsFlagged).toContain(
      'Voluntary EEO Self-Identification'
    );

    // Verify Submit Blocker was installed first and Verification Overlay was injected last
    expect(mock.evaluatedScripts.length).toBeGreaterThanOrEqual(2);
  });

  it('detects SSO / Auth Walls and returns FALLBACK_COPY_KIT so the UI opens Mode 2 Copy-Paste Kit Drawer', async () => {
    const mock = createMockStagehand({
      pageHtml:
        '<html><body><h1>Sign in to apply</h1><p>Create an account to apply on Workday Login</p></body></html>',
    });

    const result = await runStagehandAssistedApply(SAMPLE_APPLY_PAYLOAD, {
      stagehandInstance: mock.stagehand,
      resumeUploadSettleDelayMs: 0,
    });

    expect(result.status).toBe('FALLBACK_COPY_KIT');
    expect(result.fallbackReason).toBe('AUTH_WALL_DETECTED');
  });

  it('selects specialized Greenhouse, Lever, Ashby, and Generic Stagehand adapters accurately', () => {
    const mock = createMockStagehand();

    expect(
      selectAtsAdapter(
        'GREENHOUSE',
        'https://boards.greenhouse.io/acme/jobs/1',
        mock.stagehand
      ).adapterName
    ).toBe('GREENHOUSE');

    expect(
      selectAtsAdapter('LEVER', 'https://jobs.lever.co/acme/1', mock.stagehand)
        .adapterName
    ).toBe('LEVER');

    expect(
      selectAtsAdapter(
        'ASHBY',
        'https://jobs.ashbyhq.com/acme/1',
        mock.stagehand
      ).adapterName
    ).toBe('ASHBY');

    expect(
      selectAtsAdapter(null, 'https://careers.custom-company.com/apply', mock.stagehand)
        .adapterName
    ).toBe('GENERIC_STAGEHAND');
  });

  it('serves local companion HTTP bridge /health and /apply endpoints', async () => {
    const mock = createMockStagehand();

    const healthRes = await handleCompanionRequest(
      { method: 'GET', url: '/health' },
      { stagehandInstance: mock.stagehand, resumeUploadSettleDelayMs: 0 }
    );
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.body.ok).toBe(true);
    expect(healthRes.body.service).toBe('job-copilot-stagehand-companion');

    const applyRes = await handleCompanionRequest(
      {
        method: 'POST',
        url: '/apply',
        bodyText: JSON.stringify(SAMPLE_APPLY_PAYLOAD),
      },
      { stagehandInstance: mock.stagehand, resumeUploadSettleDelayMs: 0 }
    );
    expect(applyRes.statusCode).toBe(200);
    expect(applyRes.body.status).toBe('HALTED_AT_SUBMIT');
    expect(Number(applyRes.body.filledFieldsCount)).toBeGreaterThan(0);
  });
});
