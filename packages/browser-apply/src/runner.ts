import path from 'node:path';
import type {
  AssistedApplyPayload,
  AssistedApplyResult,
  StagehandExecutionMode,
  StagehandInstanceLike,
} from './types';
import { selectAtsAdapter } from './adapters';
import {
  installSubmitButtonBlocker,
  injectHardStopVerificationOverlay,
} from './overlay/verification-banner';

export interface RunAssistedApplyOptions {
  stagehandInstance?: StagehandInstanceLike;
  resumeUploadSettleDelayMs?: number;
}

async function createDefaultStagehandInstance(
  mode: StagehandExecutionMode
): Promise<StagehandInstanceLike> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<{ Stagehand: new (opts: Record<string, unknown>) => StagehandInstanceLike }>;

  const { Stagehand } = await dynamicImport('@browserbasehq/stagehand');

  if (mode === 'browserbase') {
    return new Stagehand({
      env: 'BROWSERBASE',
      enableCaching: true,
      modelName: 'gemini-3.5-flash',
    });
  }

  return new Stagehand({
    env: 'LOCAL',
    enableCaching: true,
    modelName: 'gemini-3.5-flash',
    localBrowserLaunchOptions: {
      headless: false, // ALWAYS headed so the candidate has full visual control
      userDataDir: path.resolve(process.cwd(), '.stagehand/persistent-profile'),
      viewport: { width: 1440, height: 960 },
      args: ['--disable-blink-features=AutomationControlled'],
    },
  });
}

export async function runStagehandAssistedApply(
  payload: AssistedApplyPayload,
  options: RunAssistedApplyOptions = {}
): Promise<AssistedApplyResult> {
  const executionMode: StagehandExecutionMode =
    payload.executionMode ??
    (process.env.STAGEHAND_EXECUTION_MODE as StagehandExecutionMode | undefined) ??
    'local-bridge';

  if (executionMode === 'copy-kit-only') {
    return {
      status: 'COPY_KIT_READY',
      executionMode: 'copy-kit-only',
      filledFieldsCount: 0,
      ambiguousFieldsFlagged: [],
      operationOrder: [],
    };
  }

  const stagehand =
    options.stagehandInstance ??
    (await createDefaultStagehandInstance(executionMode));

  const initResult = await stagehand.init();
  const page = stagehand.page;

  // 1. Install strict safety interceptor: prevent any programmatic click on final Submit buttons
  await installSubmitButtonBlocker(page);

  await page.goto(payload.jobPosting.applicationUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });

  // 2. Select specialized ATS adapter or generic Stagehand accessibility-tree adapter
  const adapter = selectAtsAdapter(
    payload.jobPosting.atsPlatform,
    payload.jobPosting.applicationUrl,
    stagehand,
    {
      resumeUploadSettleDelayMs: options.resumeUploadSettleDelayMs,
    }
  );

  // 3. Execute pre-fill steps: Resume Upload -> Identity Fields -> Custom Screening Questions
  const fillReport = await adapter.preFillApplication(payload);

  if (fillReport.fallbackRequired) {
    return {
      status: 'FALLBACK_COPY_KIT',
      executionMode,
      filledFieldsCount: fillReport.filledFields.length,
      ambiguousFieldsFlagged: fillReport.ambiguousFields,
      operationOrder: fillReport.operationOrder,
      fallbackReason: fillReport.fallbackReason,
    };
  }

  // 4. Disarm programmatic blocker, highlight ambiguous/EEO fields in Amber, and inject Verification Banner
  await injectHardStopVerificationOverlay(page, {
    companyName: payload.jobPosting.companyName,
    jobTitle: payload.jobPosting.title,
    filledFieldsCount: fillReport.filledFields.length,
    ambiguousFieldsFlagged: fillReport.ambiguousFields,
    specialInstructionsChecklist: payload.jobPosting.specialInstructions,
  });

  const liveViewUrl =
    executionMode === 'browserbase'
      ? (initResult && typeof initResult === 'object' && 'debugUrl' in initResult
          ? initResult.debugUrl
          : undefined) ??
        `https://www.browserbase.com/devtools-fullscreen/inspector.html?jobId=${payload.jobPosting.id}`
      : undefined;

  return {
    status: 'HALTED_AT_SUBMIT',
    executionMode,
    filledFieldsCount: fillReport.filledFields.length,
    ambiguousFieldsFlagged: fillReport.ambiguousFields,
    operationOrder: fillReport.operationOrder,
    haltedAtSubmitAt: new Date().toISOString(),
    liveViewUrl,
  };
}
