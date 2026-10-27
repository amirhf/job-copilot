import {
  CareerDocumentExtractionSchema,
  type CareerDocumentExtraction,
} from '@job-copilot/db';
import {
  generateStructuredWithTier,
  type ModelTier,
} from '../routers/model-router';
import {
  CAREER_INGESTION_SYSTEM_PROMPT,
  buildCareerIngestionUserPrompt,
} from '../prompts/career-ingestion';

export interface ExtractCareerDocumentInput {
  sourceTitle: string;
  sourceType:
    | 'RESUME_UPLOAD'
    | 'PROJECT_DOC'
    | 'PORTFOLIO_URL'
    | 'GITHUB_REPO'
    | 'GAP_RESOLUTION_PROMPT'
    | 'MANUAL_UI_ENTRY';
  rawMarkdownContent: string;
  tierOverride?: ModelTier;
}

export interface ExtractCareerDocumentResult {
  extraction: CareerDocumentExtraction;
  modelUsed: string;
  reclassifiedOrphanSkills: string[];
}

/**
 * Enforces the Zero-Hallucination Evidence Invariant:
 * Every skill in `extraction.skills` must reference at least one valid `tempExperienceId`,
 * `tempBulletId`, `tempProjectId`, or `tempStoryId` extracted from the same document.
 * Any skill whose `evidenceLinks` point exclusively to non-existent temp IDs is demoted to
 * `unverifiedSkillMentions` rather than fabricating or dropping the skill silently.
 */
export function enforceEvidenceIntegrity(extraction: CareerDocumentExtraction): {
  sanitized: CareerDocumentExtraction;
  reclassifiedOrphanSkills: string[];
} {
  const validTempIds = new Set<string>();

  for (const exp of extraction.experiences) {
    validTempIds.add(exp.tempExperienceId);
    for (const bullet of exp.bullets) {
      validTempIds.add(bullet.tempBulletId);
    }
  }
  for (const proj of extraction.projects) {
    validTempIds.add(proj.tempProjectId);
  }
  for (const story of extraction.stories) {
    validTempIds.add(story.tempStoryId);
  }

  const verifiedSkills: CareerDocumentExtraction['skills'] = [];
  const unverifiedSet = new Set<string>(extraction.unverifiedSkillMentions);
  const reclassifiedOrphanSkills: string[] = [];

  for (const skill of extraction.skills) {
    const validLinks = skill.evidenceLinks.filter(
      (link) =>
        validTempIds.has(link.sourceBlockTempId) &&
        link.verbatimEvidenceExcerpt.trim().length > 0
    );

    if (validLinks.length > 0) {
      verifiedSkills.push({
        ...skill,
        normalizedSlug: normalizeSkillSlug(skill.normalizedSlug || skill.name),
        evidenceLinks: validLinks,
      });
    } else {
      unverifiedSet.add(skill.name);
      reclassifiedOrphanSkills.push(skill.name);
    }
  }

  return {
    sanitized: {
      ...extraction,
      skills: verifiedSkills,
      unverifiedSkillMentions: Array.from(unverifiedSet),
    },
    reclassifiedOrphanSkills,
  };
}

export function normalizeSkillSlug(raw: string): string {
  const lower = raw.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    postgres: 'postgresql',
    k8s: 'kubernetes',
    'react.js': 'react',
    reactjs: 'react',
    'next.js': 'nextjs',
    'node.js': 'nodejs',
    nodejs: 'nodejs',
    ts: 'typescript',
    js: 'javascript',
    golang: 'go',
  };
  if (aliasMap[lower]) return aliasMap[lower];
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function extractCareerDocumentBlocks(
  input: ExtractCareerDocumentInput
): Promise<ExtractCareerDocumentResult> {
  const tier = input.tierOverride ?? 'TIER_1_INGESTION';
  const userPrompt = buildCareerIngestionUserPrompt({
    sourceTitle: input.sourceTitle,
    sourceType: input.sourceType,
    rawMarkdownContent: input.rawMarkdownContent,
  });

  const { object, modelUsed } = await generateStructuredWithTier({
    tier,
    schema: CareerDocumentExtractionSchema,
    systemPrompt: CAREER_INGESTION_SYSTEM_PROMPT,
    userPrompt,
  });

  const { sanitized, reclassifiedOrphanSkills } = enforceEvidenceIntegrity(object);

  return {
    extraction: sanitized,
    modelUsed,
    reclassifiedOrphanSkills,
  };
}
