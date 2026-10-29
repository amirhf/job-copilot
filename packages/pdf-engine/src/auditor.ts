import type {
  TailoredResumePayload,
  AnsweredScreeningQuestion,
  PdfCompilationAudit,
  SpecialPostingInstruction,
} from '@job-copilot/db';

/**
 * Extracts numeric tokens (percentages, dollar figures, multipliers, and numbers >= 2 digits)
 * from a bullet statement to verify that synthesis never invented or inflated metrics.
 */
export function extractNumericClaims(text: string): string[] {
  const matches = text.match(/(\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\s*%|\s*x|\s*[kKmMbB]\b)?)/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/\s+/g, '').toLowerCase());
}

export function verifyZeroHallucinationMetrics(payload: TailoredResumePayload): {
  passed: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const exp of payload.selectedExperiences) {
    for (const bullet of exp.tailoredBullets) {
      if (!bullet.sourceBulletId || !bullet.originalText) {
        violations.push(
          `Bullet under ${exp.companyName} is missing sourceBulletId traceability`
        );
        continue;
      }

      const originalNumbers = new Set(extractNumericClaims(bullet.originalText));
      const tailoredNumbers = extractNumericClaims(bullet.tailoredText);

      for (const numToken of tailoredNumbers) {
        if (!originalNumbers.has(numToken)) {
          violations.push(
            `Unverified metric "${numToken}" in tailored bullet "${bullet.tailoredText}" (original: "${bullet.originalText}")`
          );
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

export function verifySpecialInstructionsCompliance(params: {
  specialInstructions: SpecialPostingInstruction[];
  coverLetterMarkdown: string;
  screeningAnswers: AnsweredScreeningQuestion[];
}): { passed: boolean; warnings: string[] } {
  if (params.specialInstructions.length === 0) {
    return { passed: true, warnings: [] };
  }

  const combinedText = [
    params.coverLetterMarkdown,
    ...params.screeningAnswers.map((a) => a.userEditedAnswer ?? a.draftedAnswer),
  ]
    .join('\n')
    .toLowerCase();

  const warnings: string[] = [];

  for (const instr of params.specialInstructions) {
    // Check if quoted phrase inside exactRequirement is present
    const quotedMatch = instr.exactRequirement.match(/["']([^"']+)["']/);
    if (quotedMatch?.[1]) {
      const requiredPhrase = quotedMatch[1].toLowerCase().trim();
      if (!combinedText.includes(requiredPhrase)) {
        warnings.push(
          `Special instruction phrase "${quotedMatch[1]}" not detected in Cover Letter or Q&A answers`
        );
      }
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
  };
}

export interface AuditCompiledPackageParams {
  pageCount: number;
  targetMaxPages?: number;
  resumePayload: TailoredResumePayload;
  coverLetterMarkdown: string;
  screeningAnswers: AnsweredScreeningQuestion[];
  targetKeywords: string[];
  specialInstructions: SpecialPostingInstruction[];
}

export function auditCompiledPackage(
  params: AuditCompiledPackageParams
): PdfCompilationAudit {
  const targetMaxPages = params.targetMaxPages ?? 1;
  const overflowDetected = params.pageCount > targetMaxPages;

  // Compute ATS keyword coverage across resume headline, summary, skills, bullets, and projects
  const resumeCorpus = [
    params.resumePayload.targetHeadline,
    params.resumePayload.executiveSummary,
    ...params.resumePayload.categorizedSkills.flatMap((g) => g.skills),
    ...params.resumePayload.selectedExperiences.flatMap((e) =>
      e.tailoredBullets.map((b) => b.tailoredText)
    ),
    ...params.resumePayload.selectedProjects.flatMap((p) => [
      p.projectName,
      p.tailoredSummary,
      ...p.tailoredHighlights,
    ]),
  ]
    .join(' ')
    .toLowerCase();

  const uniqueTargetKeywords = Array.from(
    new Set(params.targetKeywords.map((k) => k.trim()).filter(Boolean))
  );
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of uniqueTargetKeywords) {
    if (resumeCorpus.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const atsKeywordCoveragePercent =
    uniqueTargetKeywords.length === 0
      ? 100
      : Math.round((matchedKeywords.length / uniqueTargetKeywords.length) * 100);

  const metricAudit = verifyZeroHallucinationMetrics(params.resumePayload);
  const specialAudit = verifySpecialInstructionsCompliance({
    specialInstructions: params.specialInstructions,
    coverLetterMarkdown: params.coverLetterMarkdown,
    screeningAnswers: params.screeningAnswers,
  });

  const auditWarnings: string[] = [
    ...metricAudit.violations,
    ...specialAudit.warnings,
  ];
  if (overflowDetected) {
    auditWarnings.push(
      `Resume page count (${params.pageCount}) exceeds target maximum (${targetMaxPages})`
    );
  }

  return {
    pageCount: params.pageCount,
    targetMaxPages,
    overflowDetected,
    atsKeywordCoveragePercent,
    matchedKeywords,
    missingKeywords,
    specialInstructionsVerified: specialAudit.passed,
    zeroHallucinationAuditPassed: metricAudit.passed,
    auditWarnings,
  };
}
