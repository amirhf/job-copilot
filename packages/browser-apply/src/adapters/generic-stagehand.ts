import type { AssistedApplyPayload } from '../types';
import { BaseAtsAdapter } from './base-adapter';

export class GenericStagehandAdapter extends BaseAtsAdapter {
  public readonly adapterName = 'GENERIC_STAGEHAND';

  protected getIdentityFieldSelectors(payload: AssistedApplyPayload) {
    return [
      {
        label: 'Full Name',
        selectors: ['input[name="name"]', 'input[autocomplete="name"]'],
        value: payload.candidate.fullName,
      },
      {
        label: 'Email Address',
        selectors: ['input[type="email"]', 'input[name="email"]'],
        value: payload.candidate.email,
      },
      {
        label: 'Phone Number',
        selectors: ['input[type="tel"]', 'input[name="phone"]'],
        value: payload.candidate.phone,
      },
      {
        label: 'Location City',
        selectors: ['input[name*="location" i]'],
        value: payload.candidate.locationCity,
      },
      {
        label: 'LinkedIn URL',
        selectors: ['input[name*="linkedin" i]'],
        value: payload.candidate.linkedinUrl,
      },
      {
        label: 'GitHub URL',
        selectors: ['input[name*="github" i]'],
        value: payload.candidate.githubUrl,
      },
    ];
  }
}
