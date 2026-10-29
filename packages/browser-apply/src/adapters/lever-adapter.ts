import type { AssistedApplyPayload } from '../types';
import { BaseAtsAdapter } from './base-adapter';

export class LeverAtsAdapter extends BaseAtsAdapter {
  public readonly adapterName = 'LEVER';

  protected getIdentityFieldSelectors(payload: AssistedApplyPayload) {
    return [
      {
        label: 'Full Name',
        selectors: ['input[name="name"]'],
        value: payload.candidate.fullName,
      },
      {
        label: 'Email',
        selectors: ['input[name="email"]'],
        value: payload.candidate.email,
      },
      {
        label: 'Phone',
        selectors: ['input[name="phone"]'],
        value: payload.candidate.phone,
      },
      {
        label: 'Current Location',
        selectors: ['input[name="location"]'],
        value: payload.candidate.locationCity,
      },
      {
        label: 'LinkedIn URL',
        selectors: ['input[name="urls[LinkedIn]"]'],
        value: payload.candidate.linkedinUrl,
      },
      {
        label: 'GitHub URL',
        selectors: ['input[name="urls[GitHub]"]'],
        value: payload.candidate.githubUrl,
      },
      {
        label: 'Portfolio URL',
        selectors: ['input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'],
        value: payload.candidate.portfolioUrl,
      },
    ];
  }
}
