import { describe, it, expect } from 'vitest';
import type { TailoredResumePayload } from '@job-copilot/db';
import {
  escapeTypstText,
  renderResumeTypstSource,
  renderCoverLetterTypstSource,
  compileTypstToPdf,
  compileResumeWithAutoFit,
  auditCompiledPackage,
  verifyZeroHallucinationMetrics,
  persistCompiledPdfArtifacts,
} from '../index';

const SAMPLE_CANDIDATE = {
  fullName: 'Alex Rivera',
  email: 'alex@example.com',
  phone: '+1-555-0199',
  locationCity: 'San Francisco, CA',
  linkedinUrl: 'https://linkedin.com/in/alexrivera',
  githubUrl: 'https://github.com/alexrivera',
};

const SAMPLE_RESUME_PAYLOAD: TailoredResumePayload = {
  targetHeadline: 'Staff AI & Distributed Systems Engineer',
  executiveSummary:
    'Staff Engineer with 8+ years architecting TypeScript monorepos, PostgreSQL hybrid search, and multi-agent systems.',
  categorizedSkills: [
    {
      categoryLabel: 'Languages & Frameworks',
      skills: ['TypeScript', 'Next.js', 'Node.js', 'PostgreSQL', 'pgvector'],
    },
  ],
  selectedExperiences: [
    {
      experienceId: 'exp_1',
      companyName: 'Acme Cloud',
      jobTitle: 'Staff Engineer',
      dateRangeText: '2022 – Present',
      locationText: 'San Francisco, CA',
      tailoredBullets: [
        {
          sourceBulletId: 'b_1',
          originalText: 'Cut p99 API latency by 42% across 12 services using pgvector.',
          tailoredText: 'Reduced p99 API latency by 42% across 12 microservices via pgvector indexing.',
        },
        {
          sourceBulletId: 'b_2',
          originalText: 'Saved $240K annually on cloud compute.',
          tailoredText: 'Optimized compute scheduling, saving $240K annually.',
        },
      ],
    },
  ],
  selectedProjects: [
    {
      projectId: 'proj_1',
      projectName: 'Agentic Workflow Router',
      tailoredSummary: 'Open-source durable execution engine in TypeScript',
      tailoredHighlights: ['Supports suspend/resume human-in-the-loop gates'],
    },
  ],
};

describe('@job-copilot/pdf-engine Typst Compiler & Zero-Hallucination Auditor (Milestone 4)', () => {
  it('escapes special Typst characters and renders valid resume and cover letter markup', () => {
    expect(escapeTypstText('Saved $240K on C# & @mastra/core [v1]')).toBe(
      'Saved \\$240K on C\\# & \\@mastra/core \\[v1\\]'
    );

    const resumeTypst = renderResumeTypstSource(
      SAMPLE_CANDIDATE,
      SAMPLE_RESUME_PAYLOAD,
      'standard'
    );
    expect(resumeTypst).toContain('Alex Rivera');
    expect(resumeTypst).toContain('TECHNICAL SKILLS');
    expect(resumeTypst).toContain('Reduced p99 API latency by 42%');

    const coverLetterTypst = renderCoverLetterTypstSource({
      candidate: SAMPLE_CANDIDATE,
      companyName: 'Linear',
      jobTitle: 'Staff Full-Stack Engineer',
      coverLetterMarkdown: 'Dear Hiring Team,\n\nI am excited to apply to Linear.',
    });
    expect(coverLetterTypst).toContain('Re: Staff Full-Stack Engineer — Linear');
  });

  it('compiles Typst to valid PDF buffers and auto-fits overflowing resumes via compact density and bullet trimming', async () => {
    const standardCompiled = await compileTypstToPdf(
      renderResumeTypstSource(SAMPLE_CANDIDATE, SAMPLE_RESUME_PAYLOAD, 'standard')
    );
    expect(standardCompiled.pdfBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(standardCompiled.pageCount).toBe(1);

    // Create a verbose resume that overflows 1 page in standard density
    const verbosePayload: TailoredResumePayload = {
      ...SAMPLE_RESUME_PAYLOAD,
      selectedExperiences: Array.from({ length: 5 }, (_, expIdx) => ({
        experienceId: `exp_${expIdx}`,
        companyName: `Company ${expIdx}`,
        jobTitle: 'Senior Systems Engineer',
        dateRangeText: '2020 – 2024',
        locationText: 'Remote',
        tailoredBullets: Array.from({ length: 4 }, (__, bIdx) => ({
          sourceBulletId: `b_${expIdx}_${bIdx}`,
          originalText: 'Architected high-throughput distributed event streaming pipelines.',
          tailoredText:
            'Architected high-throughput distributed event streaming pipelines handling mission-critical production workloads across multi-region clusters with strict SLA guarantees and automated failover.',
        })),
      })),
    };

    const fitted = await compileResumeWithAutoFit({
      candidate: SAMPLE_CANDIDATE,
      resumePayload: verbosePayload,
      targetMaxPages: 1,
    });

    expect(fitted.compiled.densityUsed).toBe('compact');
    expect(fitted.compiled.pageCount).toBe(1);
  });

  it('audits ATS keyword coverage, detects hallucinated metrics, and verifies easter-egg phrases', async () => {
    const cleanAudit = auditCompiledPackage({
      pageCount: 1,
      targetMaxPages: 1,
      resumePayload: SAMPLE_RESUME_PAYLOAD,
      coverLetterMarkdown: 'Here is my application including the secret phrase blue-giraffe.',
      screeningAnswers: [],
      targetKeywords: ['TypeScript', 'PostgreSQL', 'pgvector', 'Kubernetes'],
      specialInstructions: [
        {
          instructionType: 'EASTER_EGG_PHRASE',
          exactRequirement: 'Include the phrase "blue-giraffe" in your cover letter',
          sourceQuote: 'Include the phrase "blue-giraffe" in your cover letter.',
        },
      ],
    });

    expect(cleanAudit.atsKeywordCoveragePercent).toBe(75);
    expect(cleanAudit.matchedKeywords).toEqual(['TypeScript', 'PostgreSQL', 'pgvector']);
    expect(cleanAudit.missingKeywords).toEqual(['Kubernetes']);
    expect(cleanAudit.zeroHallucinationAuditPassed).toBe(true);
    expect(cleanAudit.specialInstructionsVerified).toBe(true);

    // Now test metric inflation detection (changing 42% to 85%)
    const inflatedPayload: TailoredResumePayload = structuredClone(SAMPLE_RESUME_PAYLOAD);
    inflatedPayload.selectedExperiences[0]!.tailoredBullets[0]!.tailoredText =
      'Reduced p99 API latency by 85% across 12 microservices.';

    const metricCheck = verifyZeroHallucinationMetrics(inflatedPayload);
    expect(metricCheck.passed).toBe(false);
    expect(metricCheck.violations[0]).toContain('Unverified metric "85%"');

    const stored = await persistCompiledPdfArtifacts({
      jobPostingId: 'job_123',
      version: 1,
      resumePdfBuffer: Buffer.from('%PDF-1.4 resume'),
      coverLetterPdfBuffer: Buffer.from('%PDF-1.4 cover'),
      provider: 'postgres',
    });
    expect(stored.storageProvider).toBe('postgres');
    expect(Buffer.from(stored.compiledResumePdfBase64, 'base64').toString('utf8')).toBe(
      '%PDF-1.4 resume'
    );
  });
});
