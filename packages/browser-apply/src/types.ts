import type {
  AnsweredScreeningQuestion,
  SpecialPostingInstruction,
} from '@job-copilot/db';

export type StagehandExecutionMode =
  | 'local-bridge'
  | 'browserbase'
  | 'copy-kit-only';

export interface AssistedApplyPayload {
  executionMode?: StagehandExecutionMode;
  jobPosting: {
    id: string;
    companyName: string;
    title: string;
    atsPlatform: string | null;
    applicationUrl: string;
    specialInstructions: SpecialPostingInstruction[];
  };
  candidate: {
    fullName: string;
    email: string;
    phone?: string | null;
    locationCity: string;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
    workAuthorization: {
      authorizedCountries: string[];
      requiresSponsorship: boolean;
      visaStatusNote?: string;
    };
  };
  applicationPackage: {
    id: string;
    compiledResumePdfBase64?: string | null;
    compiledCoverLetterPdfBase64?: string | null;
    compiledResumePdfPath?: string | null;
    compiledCoverLetterPdfPath?: string | null;
    screeningQuestionAnswers: AnsweredScreeningQuestion[];
  };
}

export interface FieldFillReport {
  operationOrder: string[];
  filledFields: string[];
  ambiguousFields: string[];
  fallbackRequired?: boolean;
  fallbackReason?: 'AUTH_WALL_DETECTED' | 'UNSUPPORTED_PORTAL';
}

export interface AssistedApplyResult {
  status: 'HALTED_AT_SUBMIT' | 'FALLBACK_COPY_KIT' | 'COPY_KIT_READY';
  executionMode: StagehandExecutionMode;
  filledFieldsCount: number;
  ambiguousFieldsFlagged: string[];
  operationOrder: string[];
  haltedAtSubmitAt?: string;
  liveViewUrl?: string;
  fallbackReason?: string;
}

export interface StagehandLocatorLike {
  first(): StagehandLocatorLike;
  count(): Promise<number>;
  setInputFiles(filePath: string): Promise<void>;
  fill(value: string): Promise<void>;
}

export interface StagehandPageLike {
  goto(
    url: string,
    options?: { waitUntil?: string; timeout?: number }
  ): Promise<void>;
  content(): Promise<string>;
  locator(selector: string): StagehandLocatorLike;
  evaluate<R = unknown, A = unknown>(
    pageFunction: string | ((arg: A) => R),
    arg?: A
  ): Promise<R>;
}

export interface StagehandInstanceLike {
  page: StagehandPageLike;
  init(): Promise<{ debugUrl?: string; sessionUrl?: string } | void>;
  act(options: {
    action: string;
    variables?: Record<string, string>;
  }): Promise<{ success?: boolean; message?: string } | void>;
  observe(options?: {
    instruction?: string;
  }): Promise<Array<{ description: string; selector: string }>>;
}
