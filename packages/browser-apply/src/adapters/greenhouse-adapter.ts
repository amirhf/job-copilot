import type { AssistedApplyPayload } from '../types';
import { BaseAtsAdapter, splitFullName } from './base-adapter';

export class GreenhouseAtsAdapter extends BaseAtsAdapter {
  public readonly adapterName = 'GREENHOUSE';

  protected getIdentityFieldSelectors(payload: AssistedApplyPayload) {
    const { firstName, lastName } = splitFullName(payload.candidate.fullName);
    return [
      {
        label: 'First Name',
        selectors: ['#first_name', 'input[name="job_application[first_name]"]'],
        value: firstName,
      },
      {
        label: 'Last Name',
        selectors: ['#last_name', 'input[name="job_application[last_name]"]'],
        value: lastName,
      },
      {
        label: 'Email',
        selectors: ['#email', 'input[name="job_application[email]"]'],
        value: payload.candidate.email,
      },
      {
        label: 'Phone',
        selectors: ['#phone', 'input[name="job_application[phone]"]'],
        value: payload.candidate.phone,
      },
      {
        label: 'Location',
        selectors: ['#job_application_location', 'input[name*="location" i]'],
        value: payload.candidate.locationCity,
      },
      {
        label: 'LinkedIn Profile',
        selectors: ['input[autocomplete="custom-question-linkedin-profile"]', 'input[name*="linkedin" i]'],
        value: payload.candidate.linkedinUrl,
      },
      {
        label: 'GitHub / Website',
        selectors: ['input[name*="github" i]', 'input[name*="website" i]'],
        value: payload.candidate.githubUrl ?? payload.candidate.portfolioUrl,
      },
    ];
  }
}
