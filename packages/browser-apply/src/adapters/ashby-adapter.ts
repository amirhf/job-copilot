import type { AssistedApplyPayload } from '../types';
import { BaseAtsAdapter } from './base-adapter';

export class AshbyAtsAdapter extends BaseAtsAdapter {
  public readonly adapterName = 'ASHBY';

  protected getIdentityFieldSelectors(payload: AssistedApplyPayload) {
    return [
      {
        label: 'Full Name',
        selectors: ['input[name="_systemfield_name"]', 'input[id="_systemfield_name"]'],
        value: payload.candidate.fullName,
      },
      {
        label: 'Email',
        selectors: ['input[name="_systemfield_email"]', 'input[id="_systemfield_email"]'],
        value: payload.candidate.email,
      },
      {
        label: 'Phone',
        selectors: ['input[name="_systemfield_phone"]', 'input[type="tel"]'],
        value: payload.candidate.phone,
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
