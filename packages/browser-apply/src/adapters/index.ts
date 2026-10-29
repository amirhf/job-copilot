import type { StagehandInstanceLike } from '../types';
import { BaseAtsAdapter, type AdapterOptions } from './base-adapter';
import { GreenhouseAtsAdapter } from './greenhouse-adapter';
import { LeverAtsAdapter } from './lever-adapter';
import { AshbyAtsAdapter } from './ashby-adapter';
import { GenericStagehandAdapter } from './generic-stagehand';

export * from './base-adapter';
export * from './greenhouse-adapter';
export * from './lever-adapter';
export * from './ashby-adapter';
export * from './generic-stagehand';

export function selectAtsAdapter(
  atsPlatform: string | null | undefined,
  applicationUrl: string,
  stagehand: StagehandInstanceLike,
  options?: AdapterOptions
): BaseAtsAdapter {
  const normalized = (atsPlatform ?? '').toUpperCase();
  const urlLower = applicationUrl.toLowerCase();

  if (normalized === 'GREENHOUSE' || urlLower.includes('greenhouse.io')) {
    return new GreenhouseAtsAdapter(stagehand, options);
  }
  if (normalized === 'LEVER' || urlLower.includes('lever.co')) {
    return new LeverAtsAdapter(stagehand, options);
  }
  if (normalized === 'ASHBY' || urlLower.includes('ashbyhq.com')) {
    return new AshbyAtsAdapter(stagehand, options);
  }
  return new GenericStagehandAdapter(stagehand, options);
}
