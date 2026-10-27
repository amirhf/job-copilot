import { eq, and } from 'drizzle-orm';
import {
  db,
  careerSources,
  careerExperiences,
  careerBullets,
  careerProjects,
  careerStories,
  careerSkills,
  careerSkillEvidence,
  type CareerDocumentExtraction,
  type Database,
} from '@job-copilot/db';
import { generateEmbeddingsBatch } from '../routers/model-router';
import { extractCareerDocumentBlocks, normalizeSkillSlug } from './career-extractor';
import { computeContentHash, normalizeMarkdownWhitespace } from './document-parser';

export const BULLET_DEDUP_COSINE_THRESHOLD = 0.92;

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function normalizeTextForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDuplicateBullet(params: {
  candidateText: string;
  candidateEmbedding: number[];
  existingBullets: Array<{ bulletText: string; embedding: number[] | null }>;
  threshold?: number;
}): boolean {
  const threshold = params.threshold ?? BULLET_DEDUP_COSINE_THRESHOLD;
  const normCandidate = normalizeTextForComparison(params.candidateText);

  for (const existing of params.existingBullets) {
    if (normalizeTextForComparison(existing.bulletText) === normCandidate) {
      return true;
    }
    if (existing.embedding && existing.embedding.length === params.candidateEmbedding.length) {
      const sim = cosineSimilarity(params.candidateEmbedding, existing.embedding);
      if (sim >= threshold) {
        return true;
      }
    }
  }
  return false;
}

export function doExperienceDatesOverlap(
  a: { startDate: string; endDate: string | null },
  b: { startDate: string; endDate: string | null }
): boolean {
  const aStart = new Date(a.startDate).getTime();
  const aEnd = a.endDate ? new Date(a.endDate).getTime() : Number.MAX_SAFE_INTEGER;
  const bStart = new Date(b.startDate).getTime();
  const bEnd = b.endDate ? new Date(b.endDate).getTime() : Number.MAX_SAFE_INTEGER;

  return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}

export interface PersistedBlockRef {
  kind: 'EXPERIENCE' | 'BULLET' | 'PROJECT' | 'STORY';
  id: string;
}

export interface CareerGraphMergeSummary {
  sourceId: string;
  skippedAsDuplicateSource: boolean;
  experiencesCreated: number;
  experiencesMerged: number;
  bulletsCreated: number;
  bulletsSkippedDuplicate: number;
  projectsCreated: number;
  storiesCreated: number;
  verifiedSkillsUpserted: number;
  unverifiedSkillsRecorded: number;
  evidenceLinksCreated: number;
}

export interface IngestCareerDocumentParams {
  profileId: string;
  title: string;
  sourceType:
    | 'RESUME_UPLOAD'
    | 'PROJECT_DOC'
    | 'PORTFOLIO_URL'
    | 'GITHUB_REPO'
    | 'GAP_RESOLUTION_PROMPT'
    | 'MANUAL_UI_ENTRY';
  sourceUrlOrPath?: string;
  rawMarkdownContent: string;
  preExtractedData?: CareerDocumentExtraction;
  database?: Database;
}

export async function ingestAndMergeCareerDocument(
  params: IngestCareerDocumentParams
): Promise<CareerGraphMergeSummary> {
  const database = params.database ?? db;
  const cleanMarkdown = normalizeMarkdownWhitespace(params.rawMarkdownContent);
  const contentHash = computeContentHash(cleanMarkdown);

  // 1. Check if identical source was already ingested for this profile
  const existingSource = await database.query.careerSources.findFirst({
    where: (cs, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(cs.profileId, params.profileId), eqOp(cs.contentHash, contentHash)),
  });

  if (existingSource) {
    return {
      sourceId: existingSource.id,
      skippedAsDuplicateSource: true,
      experiencesCreated: 0,
      experiencesMerged: 0,
      bulletsCreated: 0,
      bulletsSkippedDuplicate: 0,
      projectsCreated: 0,
      storiesCreated: 0,
      verifiedSkillsUpserted: 0,
      unverifiedSkillsRecorded: 0,
      evidenceLinksCreated: 0,
    };
  }

  // 2. Extract structured Career Blocks if not pre-supplied
  const extraction =
    params.preExtractedData ??
    (
      await extractCareerDocumentBlocks({
        sourceTitle: params.title,
        sourceType: params.sourceType,
        rawMarkdownContent: cleanMarkdown,
      })
    ).extraction;

  // 3. Batch-generate all 768-dim embeddings in a single call before opening DB transaction
  const experienceTexts = extraction.experiences.map(
    (e) => `${e.jobTitle} at ${e.companyName}. ${e.roleOverview} ${e.primaryTechStack.join(', ')}`
  );
  const allBulletsFlat = extraction.experiences.flatMap((e) =>
    e.bullets.map((b) => ({ expTempId: e.tempExperienceId, bullet: b }))
  );
  const bulletTexts = allBulletsFlat.map(
    ({ bullet }) =>
      `${bullet.bulletText} ${bullet.technicalApproach ?? ''} ${bullet.skillTags.join(', ')}`
  );
  const projectTexts = extraction.projects.map(
    (p) =>
      `${p.projectName}: ${p.tagline}. ${p.problemStatement} ${p.architectureAndStack} ${p.techStackTags.join(', ')}`
  );
  const storyTexts = extraction.stories.map(
    (s) => `${s.title}. Situation: ${s.situation} Task: ${s.task} Action: ${s.action} Result: ${s.result}`
  );
  const skillTexts = extraction.skills.map(
    (sk) => `${sk.name} (${sk.category}): ${sk.aliases.join(', ')}`
  );

  const combinedTexts = [
    ...experienceTexts,
    ...bulletTexts,
    ...projectTexts,
    ...storyTexts,
    ...skillTexts,
  ];
  const combinedEmbeddings = await generateEmbeddingsBatch(combinedTexts);

  let offset = 0;
  const expEmbeddings = combinedEmbeddings.slice(offset, (offset += experienceTexts.length));
  const bulletEmbeddings = combinedEmbeddings.slice(offset, (offset += bulletTexts.length));
  const projEmbeddings = combinedEmbeddings.slice(offset, (offset += projectTexts.length));
  const storyEmbeddings = combinedEmbeddings.slice(offset, (offset += storyTexts.length));
  const skillEmbeddings = combinedEmbeddings.slice(offset, (offset += skillTexts.length));

  // 4. Execute Graph Merge inside a transaction
  return await database.transaction(async (tx) => {
    const [insertedSource] = await tx
      .insert(careerSources)
      .values({
        profileId: params.profileId,
        sourceType: params.sourceType,
        title: params.title,
        sourceUrlOrPath: params.sourceUrlOrPath,
        rawMarkdownContent: cleanMarkdown,
        contentHash,
      })
      .returning();

    if (!insertedSource) {
      throw new Error('Failed to insert career_sources record');
    }

    const tempIdMap = new Map<string, PersistedBlockRef>();
    let experiencesCreated = 0;
    let experiencesMerged = 0;
    let bulletsCreated = 0;
    let bulletsSkippedDuplicate = 0;
    let projectsCreated = 0;
    let storiesCreated = 0;
    let verifiedSkillsUpserted = 0;
    let unverifiedSkillsRecorded = 0;
    let evidenceLinksCreated = 0;

    // Fetch existing experiences for this profile to check for company + date overlap merges
    const existingExperiences = await tx.query.careerExperiences.findMany({
      where: (ce, { eq: eqOp }) => eqOp(ce.profileId, params.profileId),
      with: {
        bullets: true,
      },
    });

    let flatBulletIdx = 0;

    for (let i = 0; i < extraction.experiences.length; i++) {
      const exp = extraction.experiences[i]!;
      const expEmbedding = expEmbeddings[i]!;

      const matchedExisting = existingExperiences.find(
        (ex) =>
          ex.normalizedCompanyName === exp.normalizedCompanyName &&
          doExperienceDatesOverlap(
            { startDate: ex.startDate, endDate: ex.endDate },
            { startDate: exp.startDate, endDate: exp.endDate }
          )
      );

      let persistedExperienceId: string;
      let currentBulletsForDedup: Array<{ bulletText: string; embedding: number[] | null }> = [];

      if (matchedExisting) {
        persistedExperienceId = matchedExisting.id;
        currentBulletsForDedup = matchedExisting.bullets.map((b) => ({
          bulletText: b.bulletText,
          embedding: b.embedding,
        }));
        experiencesMerged++;
      } else {
        const [createdExp] = await tx
          .insert(careerExperiences)
          .values({
            profileId: params.profileId,
            sourceId: insertedSource.id,
            companyName: exp.companyName,
            normalizedCompanyName: exp.normalizedCompanyName,
            jobTitle: exp.jobTitle,
            employmentType: exp.employmentType,
            location: exp.location,
            remotePolicy: exp.remotePolicy,
            startDate: exp.startDate,
            endDate: exp.endDate,
            isCurrent: exp.isCurrent,
            companyStageAndContext: exp.companyStageAndContext,
            roleOverview: exp.roleOverview,
            domainTags: exp.domainTags,
            primaryTechStack: exp.primaryTechStack,
            displayOrder: i,
            embedding: expEmbedding,
          })
          .returning();

        if (!createdExp) throw new Error('Failed to insert experience');
        persistedExperienceId = createdExp.id;
        experiencesCreated++;
      }

      tempIdMap.set(exp.tempExperienceId, {
        kind: 'EXPERIENCE',
        id: persistedExperienceId,
      });

      for (let bIdx = 0; bIdx < exp.bullets.length; bIdx++) {
        const bullet = exp.bullets[bIdx]!;
        const bulletEmbedding = bulletEmbeddings[flatBulletIdx++]!;

        if (
          isDuplicateBullet({
            candidateText: bullet.bulletText,
            candidateEmbedding: bulletEmbedding,
            existingBullets: currentBulletsForDedup,
          })
        ) {
          bulletsSkippedDuplicate++;
          // Map tempBulletId to the parent experience so skill evidence links still resolve cleanly
          tempIdMap.set(bullet.tempBulletId, {
            kind: 'EXPERIENCE',
            id: persistedExperienceId,
          });
          continue;
        }

        const [createdBullet] = await tx
          .insert(careerBullets)
          .values({
            profileId: params.profileId,
            experienceId: persistedExperienceId,
            sourceId: insertedSource.id,
            bulletText: bullet.bulletText,
            actionVerb: bullet.actionVerb,
            situationAndTask: bullet.situationAndTask,
            technicalApproach: bullet.technicalApproach,
            quantifiedMetrics: bullet.quantifiedMetrics,
            hasVerifiedMetric: bullet.quantifiedMetrics.length > 0,
            skillTags: bullet.skillTags,
            impactScore: bullet.impactScore,
            displayOrder: currentBulletsForDedup.length + bIdx,
            embedding: bulletEmbedding,
          })
          .returning();

        if (!createdBullet) throw new Error('Failed to insert career_bullet');
        bulletsCreated++;
        currentBulletsForDedup.push({
          bulletText: bullet.bulletText,
          embedding: bulletEmbedding,
        });
        tempIdMap.set(bullet.tempBulletId, {
          kind: 'BULLET',
          id: createdBullet.id,
        });
      }
    }

    // 5. Insert Projects
    for (let i = 0; i < extraction.projects.length; i++) {
      const proj = extraction.projects[i]!;
      const projEmbedding = projEmbeddings[i]!;

      const [createdProj] = await tx
        .insert(careerProjects)
        .values({
          profileId: params.profileId,
          sourceId: insertedSource.id,
          projectName: proj.projectName,
          tagline: proj.tagline,
          problemStatement: proj.problemStatement,
          architectureAndStack: proj.architectureAndStack,
          quantifiedOutcomes: proj.quantifiedOutcomes,
          highlightBullets: proj.highlightBullets,
          techStackTags: proj.techStackTags,
          repositoryUrl: proj.repositoryUrl || null,
          liveDemoUrl: proj.liveDemoUrl || null,
          embedding: projEmbedding,
        })
        .returning();

      if (!createdProj) throw new Error('Failed to insert career_project');
      projectsCreated++;
      tempIdMap.set(proj.tempProjectId, {
        kind: 'PROJECT',
        id: createdProj.id,
      });
    }

    // 6. Insert STAR Stories
    for (let i = 0; i < extraction.stories.length; i++) {
      const story = extraction.stories[i]!;
      const storyEmbedding = storyEmbeddings[i]!;
      const linkedExp = story.linkedTempExperienceId
        ? tempIdMap.get(story.linkedTempExperienceId)
        : undefined;
      const linkedProj = story.linkedTempProjectId
        ? tempIdMap.get(story.linkedTempProjectId)
        : undefined;

      const [createdStory] = await tx
        .insert(careerStories)
        .values({
          profileId: params.profileId,
          sourceId: insertedSource.id,
          linkedExperienceId: linkedExp?.kind === 'EXPERIENCE' ? linkedExp.id : null,
          linkedProjectId: linkedProj?.kind === 'PROJECT' ? linkedProj.id : null,
          title: story.title,
          situation: story.situation,
          task: story.task,
          action: story.action,
          result: story.result,
          quantifiedMetrics: story.quantifiedMetrics,
          themes: story.themes,
          embedding: storyEmbedding,
        })
        .returning();

      if (!createdStory) throw new Error('Failed to insert career_story');
      storiesCreated++;
      tempIdMap.set(story.tempStoryId, {
        kind: 'STORY',
        id: createdStory.id,
      });
    }

    // 7. Upsert Verified Skills & Insert Evidence Links
    for (let i = 0; i < extraction.skills.length; i++) {
      const skill = extraction.skills[i]!;
      const skillEmbedding = skillEmbeddings[i]!;
      const slug = normalizeSkillSlug(skill.normalizedSlug || skill.name);

      const existingSkill = await tx.query.careerSkills.findFirst({
        where: (cs, { and: andOp, eq: eqOp }) =>
          andOp(eqOp(cs.profileId, params.profileId), eqOp(cs.normalizedSlug, slug)),
      });

      let skillId: string;
      if (existingSkill) {
        skillId = existingSkill.id;
        if (!existingSkill.isUserVerified) {
          await tx
            .update(careerSkills)
            .set({
              isUserVerified: true,
              proficiency: skill.proficiency,
              updatedAt: new Date(),
            })
            .where(eq(careerSkills.id, existingSkill.id));
        }
      } else {
        const [insertedSkill] = await tx
          .insert(careerSkills)
          .values({
            profileId: params.profileId,
            name: skill.name,
            normalizedSlug: slug,
            aliases: skill.aliases,
            category: skill.category,
            proficiency: skill.proficiency,
            adjacentSkillSlugs: skill.adjacentSkillSlugs,
            isUserVerified: true,
            embedding: skillEmbedding,
          })
          .returning();

        if (!insertedSkill) throw new Error('Failed to insert career_skill');
        skillId = insertedSkill.id;
      }
      verifiedSkillsUpserted++;

      for (const link of skill.evidenceLinks) {
        const target = tempIdMap.get(link.sourceBlockTempId);
        if (!target) continue;

        await tx.insert(careerSkillEvidence).values({
          skillId,
          experienceId: target.kind === 'EXPERIENCE' ? target.id : null,
          bulletId: target.kind === 'BULLET' ? target.id : null,
          projectId: target.kind === 'PROJECT' ? target.id : null,
          storyId: target.kind === 'STORY' ? target.id : null,
          verbatimEvidenceExcerpt: link.verbatimEvidenceExcerpt,
        });
        evidenceLinksCreated++;
      }
    }

    // 8. Persist Unverified Skill Mentions with isUserVerified = false for the /profile Inbox
    for (const rawMention of extraction.unverifiedSkillMentions) {
      const slug = normalizeSkillSlug(rawMention);
      if (!slug) continue;

      const existing = await tx.query.careerSkills.findFirst({
        where: (cs, { and: andOp, eq: eqOp }) =>
          andOp(eqOp(cs.profileId, params.profileId), eqOp(cs.normalizedSlug, slug)),
      });

      if (!existing) {
        await tx.insert(careerSkills).values({
          profileId: params.profileId,
          name: rawMention.trim(),
          normalizedSlug: slug,
          category: 'TOOL_PLATFORM',
          proficiency: 'FAMILIAR',
          isUserVerified: false,
        });
        unverifiedSkillsRecorded++;
      }
    }

    return {
      sourceId: insertedSource.id,
      skippedAsDuplicateSource: false,
      experiencesCreated,
      experiencesMerged,
      bulletsCreated,
      bulletsSkippedDuplicate,
      projectsCreated,
      storiesCreated,
      verifiedSkillsUpserted,
      unverifiedSkillsRecorded,
      evidenceLinksCreated,
    };
  });
}

export interface AddSkillFromGapResolutionParams {
  profileId: string;
  experienceId: string;
  skillName: string;
  category?:
    | 'LANGUAGE'
    | 'FRAMEWORK_LIBRARY'
    | 'DATABASE_STORAGE'
    | 'CLOUD_INFRASTRUCTURE'
    | 'AI_ML_DATA'
    | 'ARCHITECTURE_CONCEPT'
    | 'TOOL_PLATFORM'
    | 'DOMAIN_INDUSTRY'
    | 'LEADERSHIP_METHODOLOGY';
  proficiency: 'EXPERT' | 'PROFICIENT' | 'FAMILIAR';
  newBulletText: string;
  actionVerb?: string;
  database?: Database;
}

/**
 * Invoked when a candidate resolves a CRITICAL or MODERATE skill gap via "Add Evidence to Master Profile".
 * Creates the verified bullet, upserts the skill (`isUserVerified = true`), links `career_skill_evidence`,
 * and embeds both with 768-dim vectors.
 */
export async function addSkillEvidenceFromGapResolution(
  params: AddSkillFromGapResolutionParams
): Promise<{ skillId: string; bulletId: string }> {
  const database = params.database ?? db;
  const slug = normalizeSkillSlug(params.skillName);
  const embeddings = await generateEmbeddingsBatch([
    `${params.newBulletText} (${params.skillName})`,
    `${params.skillName}`,
  ]);
  const bulletEmbedding = embeddings[0]!;
  const skillEmbedding = embeddings[1]!;

  return await database.transaction(async (tx) => {
    const [createdBullet] = await tx
      .insert(careerBullets)
      .values({
        profileId: params.profileId,
        experienceId: params.experienceId,
        bulletText: params.newBulletText,
        actionVerb: params.actionVerb ?? (params.newBulletText.split(/\s+/)[0] || 'Built'),
        skillTags: [params.skillName],
        impactScore: 75,
        embedding: bulletEmbedding,
      })
      .returning();

    if (!createdBullet) throw new Error('Failed to create gap-resolution bullet');

    const existingSkill = await tx.query.careerSkills.findFirst({
      where: (cs) =>
        and(eq(cs.profileId, params.profileId), eq(cs.normalizedSlug, slug)),
    });

    let skillId: string;
    if (existingSkill) {
      skillId = existingSkill.id;
      await tx
        .update(careerSkills)
        .set({
          isUserVerified: true,
          proficiency: params.proficiency,
          embedding: skillEmbedding,
          updatedAt: new Date(),
        })
        .where(eq(careerSkills.id, existingSkill.id));
    } else {
      const [createdSkill] = await tx
        .insert(careerSkills)
        .values({
          profileId: params.profileId,
          name: params.skillName,
          normalizedSlug: slug,
          category: params.category ?? 'FRAMEWORK_LIBRARY',
          proficiency: params.proficiency,
          isUserVerified: true,
          embedding: skillEmbedding,
        })
        .returning();

      if (!createdSkill) throw new Error('Failed to create gap-resolution skill');
      skillId = createdSkill.id;
    }

    await tx.insert(careerSkillEvidence).values({
      skillId,
      experienceId: params.experienceId,
      bulletId: createdBullet.id,
      verbatimEvidenceExcerpt: params.newBulletText,
    });

    return { skillId, bulletId: createdBullet.id };
  });
}
