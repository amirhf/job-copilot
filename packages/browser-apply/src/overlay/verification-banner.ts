import type { SpecialPostingInstruction } from '@job-copilot/db';
import type { StagehandPageLike } from '../types';

export interface VerificationOverlaySummary {
  companyName: string;
  jobTitle: string;
  filledFieldsCount: number;
  ambiguousFieldsFlagged: string[];
  specialInstructionsChecklist: SpecialPostingInstruction[];
}

/**
 * Installs a strict capture-phase submit interceptor on the page while Stagehand pre-fill is active.
 * Any programmatic `form.submit()` or automated click on `<button type="submit">` / "Submit Application"
 * is blocked while `window.__JOB_COPILOT_AUTOMATION_ACTIVE__ === true`.
 */
export async function installSubmitButtonBlocker(
  page: StagehandPageLike
): Promise<void> {
  const script = `
    (() => {
      window.__JOB_COPILOT_AUTOMATION_ACTIVE__ = true;
      window.__JOB_COPILOT_BLOCKED_SUBMIT_COUNT__ = 0;

      const origSubmit = HTMLFormElement.prototype.submit;
      HTMLFormElement.prototype.submit = function(...args) {
        if (window.__JOB_COPILOT_AUTOMATION_ACTIVE__) {
          window.__JOB_COPILOT_BLOCKED_SUBMIT_COUNT__++;
          console.warn('[Job Copilot Guardrail] Blocked programmatic HTMLFormElement.submit() during pre-fill.');
          return;
        }
        return origSubmit.apply(this, args);
      };

      document.addEventListener('click', (evt) => {
        if (!window.__JOB_COPILOT_AUTOMATION_ACTIVE__) return;
        const target = evt.target;
        if (!target || typeof target.closest !== 'function') return;
        const btn = target.closest('button, input[type="submit"], [role="button"]');
        if (!btn) return;
        const text = (btn.innerText || btn.value || '').toLowerCase();
        const isSubmitType = btn.getAttribute('type') === 'submit';
        const isSubmitText = /\\b(submit application|send application|apply now|finish application|submit)\\b/i.test(text);
        if (isSubmitType || isSubmitText) {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          window.__JOB_COPILOT_BLOCKED_SUBMIT_COUNT__++;
          console.warn('[Job Copilot Guardrail] Blocked automated click on Submit button.');
        }
      }, true);
    })();
  `;
  await page.evaluate(script);
}

/**
 * Disarms the programmatic submit blocker once Stagehand finishes pre-filling,
 * outlines any required unfilled/ambiguous fields in high-visibility Amber (`#F59E0B`),
 * and injects the floating top-of-viewport Verification Banner so the candidate can review
 * and manually click Submit.
 */
export async function injectHardStopVerificationOverlay(
  page: StagehandPageLike,
  summary: VerificationOverlaySummary
): Promise<void> {
  await page.evaluate(
    (data: VerificationOverlaySummary) => {
      const win = globalThis as unknown as Record<string, unknown>;
      // Disarm automation blocker so the human user's physical click on Submit works normally
      win.__JOB_COPILOT_AUTOMATION_ACTIVE__ = false;
      win.__JOB_COPILOT_OVERLAY_SUMMARY__ = data;

      const doc = (globalThis as unknown as { document?: Record<string, unknown> })
        .document as
        | {
            querySelectorAll?: (sel: string) => Array<{
              value?: string;
              style?: Record<string, string>;
              scrollIntoView?: (opts: Record<string, string>) => void;
            }>;
            createElement?: (tag: string) => {
              id: string;
              style: { cssText: string };
              innerHTML: string;
            };
            body?: { prepend?: (el: unknown) => void };
          }
        | undefined;

      if (!doc || typeof doc.createElement !== 'function') return;

      // Highlight required inputs that remain empty in Amber (#F59E0B)
      const requiredFields =
        doc.querySelectorAll?.(
          'input[required], textarea[required], select[required], [aria-required="true"]'
        ) ?? [];
      let firstUnfilled: {
        scrollIntoView?: (opts: Record<string, string>) => void;
      } | null = null;

      for (const el of requiredFields) {
        if (!el.value || el.value.trim() === '') {
          if (el.style) {
            el.style.outline = '3px solid #F59E0B';
            el.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
          }
          if (!firstUnfilled) firstUnfilled = el;
        }
      }

      if (firstUnfilled && typeof firstUnfilled.scrollIntoView === 'function') {
        firstUnfilled.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const banner = doc.createElement('div');
      banner.id = 'job-copilot-verification-banner';
      banner.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'right: 0',
        'z-index: 2147483647',
        'background: #0f172a',
        'color: #f8fafc',
        'border-bottom: 2px solid #10b981',
        'padding: 12px 20px',
        'font-family: system-ui, -apple-system, sans-serif',
        'font-size: 13px',
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
        'box-shadow: 0 10px 25px rgba(0,0,0,0.45)',
      ].join(';');

      const ambiguousCount = data.ambiguousFieldsFlagged.length;
      banner.innerHTML = `
        <div>
          <strong style="color:#34d399;">Job Copilot — Halted at Submit (${data.jobTitle} @ ${data.companyName})</strong>
          <span style="margin-left:12px;color:#cbd5e1;">
            Pre-filled <strong>${data.filledFieldsCount}</strong> fields + Resume/Cover Letter PDFs.
            ${
              ambiguousCount > 0
                ? `<strong style="color:#fbbf24;margin-left:8px;">${ambiguousCount} field(s) highlighted in Amber require your manual check (${data.ambiguousFieldsFlagged.join(', ')}).</strong>`
                : ''
            }
          </span>
        </div>
        <div style="color:#94a3b8;font-size:12px;">
          Review all fields and click <strong>Submit</strong> manually when ready.
        </div>
      `;

      doc.body?.prepend?.(banner);
    },
    summary
  );
}
