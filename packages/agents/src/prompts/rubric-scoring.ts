export const RUBRIC_SCORING_SYSTEM_PROMPT = `You are the **Calibration & Fit Assessment Engine** for the Agentic Job Application Copilot.
Evaluate the target \`JobPosting\` against the candidate's verified \`MasterCareerGraph\` retrieved via hybrid search and their learned \`PreferenceMemory\`.

### SCORING CALIBRATION & ZERO-HALLUCINATION RULES
1. **Strict Evidence Grounding:**
   - Only credit a technical skill, leadership scope, or domain achievement if it appears in the provided \`verifiedSkills\`, \`matchedExperiences\`, \`matchedBullets\`, or \`matchedProjects\`.
   - Every ID placed in \`topMatchedBlockIds\` MUST exist in the retrieved context.
2. **Category Scoring Anchors (0–100):**
   - \`90–100\`: Near-perfect alignment; candidate has shipped production systems with the exact core stack, seniority scope, and domain.
   - \`75–89\`: Strong fit; candidate meets >= 80% of core requirements and has clear adjacent skills for minor gaps.
   - \`55–74\`: Partial/stretch fit; candidate is missing 1–2 notable requirements or is transitioning across domains/seniority.
   - \`0–54\`: Weak fit; core technical stack or seniority scope diverges substantially.
3. **Gap Severity Classification (\`flaggedGaps\`):**
   - \`CRITICAL\`: A hard "Must-Have" requirement central to the role (e.g., "5+ years production Rust" or "Experience with FDA Class II medical device submissions") that has ZERO direct evidence in the Master Career Graph. Flagging a \`CRITICAL\` gap will pause downstream material generation (\`PAUSED_NEEDS_INPUT\`) to ask the candidate if they have unrecorded experience.
   - \`MODERATE\`: An important requirement missing direct evidence, but bridgeable via one of the candidate's \`adjacentVerifiedSkills\` (e.g., job asks for \`GCP Cloud Run\`, candidate has verified production \`AWS ECS/Fargate\` & \`Kubernetes\`).
   - \`MINOR\`: A "Nice-to-Have" tool or secondary library that does not block candidacy.
4. **Preference Memory Enforcement:**
   - Review the provided \`learnedRejectionRules\` from \`preference_memory\`. If the job exhibits patterns the user has repeatedly rejected (e.g., heavy on-call maintenance, specific sub-industries), apply an appropriate negative \`preferencePenaltyPoints\` (-5 to -30) and note it in \`executiveSummary\`.`;

export interface StaticCandidateCachePayload {
  headline: string;
  executiveBio: string | null;
  totalYearsExperience: number;
  targetRoles: string[];
  verifiedSkills: Array<{
    id: string;
    name: string;
    category: string;
    proficiency: string;
    adjacentSkillSlugs: string[];
  }>;
  experiencesOverview: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    startDate: string;
    endDate: string | null;
    roleOverview: string;
    primaryTechStack: string[];
  }>;
  learnedScoringPreferences: Array<{
    preferenceType: string;
    ruleStatement: string;
    confidenceWeight: number;
  }>;
}

/**
 * Builds a deterministic, static prefix representing the candidate's verified profile and preference rules.
 * Because this prefix remains identical across all jobs evaluated in a batch sync run, LLM providers
 * (Gemini, Anthropic, OpenAI) cache these tokens at a 75%-90% input cost discount.
 */
export function buildStaticCandidateCachePrefix(payload: StaticCandidateCachePayload): string {
  return JSON.stringify(
    {
      candidateOverview: {
        headline: payload.headline,
        executiveBio: payload.executiveBio,
        totalYearsExperience: payload.totalYearsExperience,
        targetRoles: payload.targetRoles,
      },
      verifiedSkills: payload.verifiedSkills,
      experiencesOverview: payload.experiencesOverview,
      learnedScoringPreferences: payload.learnedScoringPreferences,
    },
    null,
    2
  );
}

export interface JobSpecificRubricPromptPayload {
  job: {
    id: string;
    companyName: string;
    title: string;
    locationRaw: string;
    remotePolicy: string;
    salaryMinUsd: number | null;
    salaryMaxUsd: number | null;
    cleanDescriptionMarkdown: string;
    extractedRequirements: {
      mustHaveSkills: string[];
      niceToHaveSkills: string[];
      minYearsExperience?: number | null;
      seniorityLevel?: string;
      domainKeywords: string[];
    };
  };
  topHybridBullets: Array<{
    id: string;
    experienceId: string;
    bulletText: string;
    skillTags: string[];
    rrfScore: number;
  }>;
  topHybridProjects: Array<{
    id: string;
    projectName: string;
    tagline: string;
    architectureAndStack: string;
    techStackTags: string[];
    rrfScore: number;
  }>;
}

export function buildJobRubricUserPrompt(payload: JobSpecificRubricPromptPayload): string {
  return [
    `=== TARGET JOB POSTING ===`,
    `Company: ${payload.job.companyName}`,
    `Title: ${payload.job.title}`,
    `Location / Remote: ${payload.job.locationRaw} (${payload.job.remotePolicy})`,
    `Salary Range USD: ${payload.job.salaryMinUsd ?? 'Unlisted'} - ${payload.job.salaryMaxUsd ?? 'Unlisted'}`,
    `Extracted Requirements: ${JSON.stringify(payload.job.extractedRequirements)}`,
    `Description:\n${payload.job.cleanDescriptionMarkdown}`,
    `\n=== TOP HYBRID-RETRIEVED CAREER BULLETS (RRF RANKED) ===`,
    JSON.stringify(payload.topHybridBullets, null, 2),
    `\n=== TOP HYBRID-RETRIEVED CAREER PROJECTS (RRF RANKED) ===`,
    JSON.stringify(payload.topHybridProjects, null, 2),
    `\nScore this role across the 4 rubric categories, cite matching block IDs, and flag any CRITICAL, MODERATE, or MINOR skill gaps.`,
  ].join('\n');
}
