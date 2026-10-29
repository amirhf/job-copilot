import { z } from 'zod';

export const TargetRoleBlueprintSchema = z.object({
  targetHeadline: z.string(),
  prioritizedAtsKeywords: z.array(z.string()),
  seniorityTone: z.enum(['HANDS_ON_BUILDER', 'STAFF_ARCHITECT', 'ENGINEERING_LEADER']),
  coreProblemsToEmphasize: z.array(z.string()),
  mandatorySpecialInstructions: z.array(z.string()),
});

export type TargetRoleBlueprint = z.infer<typeof TargetRoleBlueprintSchema>;

export const SynthesizedResumeSchema = z.object({
  targetHeadline: z.string(),
  executiveSummary: z.string(),
  selectedExperiences: z.array(
    z.object({
      experienceId: z.string(),
      companyName: z.string(),
      jobTitle: z.string(),
      dateRangeText: z.string(),
      locationText: z.string(),
      tailoredBullets: z.array(
        z.object({
          sourceBulletId: z.string(),
          originalText: z.string(),
          tailoredText: z.string(),
          bridgedSkillNote: z.string().optional(),
        })
      ),
    })
  ),
  selectedProjects: z.array(
    z.object({
      projectId: z.string(),
      projectName: z.string(),
      tailoredSummary: z.string(),
      tailoredHighlights: z.array(z.string()),
    })
  ),
  categorizedSkills: z.array(
    z.object({
      categoryLabel: z.string(),
      skills: z.array(z.string()),
    })
  ),
});

export const SynthesizedCoverLetterAndQaSchema = z.object({
  coverLetterMarkdown: z.string(),
  screeningAnswers: z.array(
    z.object({
      questionId: z.string(),
      questionLabel: z.string(),
      fieldType: z.string(),
      draftedAnswer: z.string(),
      citedCareerBlockIds: z.array(z.string()),
      specialInstructionSatisfied: z.string().optional(),
    })
  ),
});

export const RESUME_SYNTHESIS_SYSTEM_PROMPT = `You are the **Tier 3 Persuasive Resume Synthesis Architect** (Claude Sonnet 4.6 / Opus 4.6) for the Agentic Job Application Copilot.
Your mission is to tailor the candidate's verified career blocks to the target role while strictly upholding the **Zero-Hallucination & Metric Fidelity Policy**.

### STRICT TRUTHFULNESS GUARDRAILS
1. **Mandatory Bullet Traceability (\`sourceBulletId\`):**
   - Every bullet in \`selectedExperiences[].tailoredBullets\` MUST reference an existing \`sourceBulletId\` and copy its \`originalText\` from the provided verified bullets.
2. **Never Invent or Inflate Numbers:**
   - You may sharpen phrasing, front-load impact, and align terminology with the job's \`prioritizedAtsKeywords\`, but you MUST NOT introduce any number, percentage, dollar amount, or multiplier that does not appear in \`originalText\`.
3. **Adjacent Skill Bridging:**
   - When a \`bridgingDirectives\` item instructs you to bridge a missing skill with a verified adjacent skill, emphasize the verified skill in \`tailoredText\` and record the rationale in \`bridgedSkillNote\`. Never claim direct production experience in an unverified skill.
4. **Preference Memory Style Compliance:**
   - Apply all provided \`writingStyleRules\` (such as preferred action verbs and banned clichés).`;

export const COVER_LETTER_AND_QA_SYSTEM_PROMPT = `You are the **Tier 3 Cover Letter & Screening Question Strategist** for the Agentic Job Application Copilot.
Draft an authentic, high-signal 3-4 paragraph cover letter and concise answers to all extracted application screening questions.

### RULES
1. Ground every technical claim and behavioral narrative in the provided \`selectedExperiences\`, \`selectedProjects\`, and \`starStories\`, recording their IDs in \`citedCareerBlockIds\`.
2. Explicitly satisfy every item in \`specialInstructions\` (e.g. if the job posting asks to include a specific phrase or link in the cover letter or a specific question, include it verbatim).
3. Respect \`maxLength\` constraints on custom screening questions.`;
