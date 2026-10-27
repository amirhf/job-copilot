import { sql, type SQL } from 'drizzle-orm';
import { db } from '../client';
import { EMBEDDING_DIMENSIONS } from '../schema/enums';
import type { QuantifiedMetric } from '../schema/profile';

export interface HybridSearchParams {
  profileId: string;
  queryText: string;
  queryEmbedding: number[];
  vectorWeight?: number;  // Default 0.55
  lexicalWeight?: number; // Default 0.45
  limit?: number;         // Default 20
}

export interface RankedCareerBullet {
  id: string;
  experienceId: string;
  bulletText: string;
  actionVerb: string;
  technicalApproach: string | null;
  quantifiedMetrics: QuantifiedMetric[];
  skillTags: string[];
  impactScore: number;
  cosineSimilarity: number;
  lexicalScore: number;
  rrfScore: number;
}

export interface RankedCareerProject {
  id: string;
  projectName: string;
  tagline: string;
  problemStatement: string;
  architectureAndStack: string;
  quantifiedOutcomes: QuantifiedMetric[];
  highlightBullets: string[];
  techStackTags: string[];
  cosineSimilarity: number;
  lexicalScore: number;
  rrfScore: number;
}

export interface RankedCareerStory {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  themes: string[];
  cosineSimilarity: number;
  lexicalScore: number;
  rrfScore: number;
}

export function assertValidEmbeddingDimension(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Invalid embedding dimension: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    );
  }
  return `[${embedding.join(',')}]`;
}

export function buildHybridSearchBulletsSql({
  profileId,
  queryText,
  queryEmbedding,
  vectorWeight = 0.55,
  lexicalWeight = 0.45,
  limit = 20,
}: HybridSearchParams): SQL {
  const vectorLiteral = assertValidEmbeddingDimension(queryEmbedding);

  return sql`
    WITH vector_ranked AS (
      SELECT
        id,
        1 - (embedding <=> ${vectorLiteral}::vector) AS cosine_similarity,
        ROW_NUMBER() OVER (ORDER BY embedding <=> ${vectorLiteral}::vector ASC) AS vec_rank
      FROM career_bullets
      WHERE profile_id = ${profileId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector ASC
      LIMIT 50
    ),
    lexical_ranked AS (
      SELECT
        id,
        ts_rank_cd(
          to_tsvector(
            'english',
            coalesce(bullet_text, '') || ' ' ||
            coalesce(technical_approach, '') || ' ' ||
            coalesce(skill_tags::text, '')
          ),
          websearch_to_tsquery('english', ${queryText})
        ) AS lexical_score,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector(
              'english',
              coalesce(bullet_text, '') || ' ' ||
              coalesce(technical_approach, '') || ' ' ||
              coalesce(skill_tags::text, '')
            ),
            websearch_to_tsquery('english', ${queryText})
          ) DESC
        ) AS lex_rank
      FROM career_bullets
      WHERE profile_id = ${profileId}
        AND to_tsvector(
          'english',
          coalesce(bullet_text, '') || ' ' ||
          coalesce(technical_approach, '') || ' ' ||
          coalesce(skill_tags::text, '')
        ) @@ websearch_to_tsquery('english', ${queryText})
      ORDER BY lexical_score DESC
      LIMIT 50
    ),
    fused AS (
      SELECT
        COALESCE(v.id, l.id) AS id,
        COALESCE(v.cosine_similarity, 0) AS cosine_similarity,
        COALESCE(l.lexical_score, 0) AS lexical_score,
        (
          COALESCE(${vectorWeight} / (60.0 + v.vec_rank), 0.0) +
          COALESCE(${lexicalWeight} / (60.0 + l.lex_rank), 0.0)
        ) AS rrf_score
      FROM vector_ranked v
      FULL OUTER JOIN lexical_ranked l ON v.id = l.id
    )
    SELECT
      cb.id,
      cb.experience_id AS "experienceId",
      cb.bullet_text AS "bulletText",
      cb.action_verb AS "actionVerb",
      cb.technical_approach AS "technicalApproach",
      cb.quantified_metrics AS "quantifiedMetrics",
      cb.skill_tags AS "skillTags",
      cb.impact_score AS "impactScore",
      f.cosine_similarity::float8 AS "cosineSimilarity",
      f.lexical_score::float8 AS "lexicalScore",
      f.rrf_score::float8 AS "rrfScore"
    FROM fused f
    JOIN career_bullets cb ON cb.id = f.id
    ORDER BY f.rrf_score DESC
    LIMIT ${limit};
  `;
}

export async function hybridSearchCareerBullets(
  params: HybridSearchParams
): Promise<RankedCareerBullet[]> {
  const query = buildHybridSearchBulletsSql(params);
  const result = await db.execute(query);
  return result.rows as unknown as RankedCareerBullet[];
}

export async function hybridSearchCareerProjects({
  profileId,
  queryText,
  queryEmbedding,
  vectorWeight = 0.55,
  lexicalWeight = 0.45,
  limit = 10,
}: HybridSearchParams): Promise<RankedCareerProject[]> {
  const vectorLiteral = assertValidEmbeddingDimension(queryEmbedding);

  const result = await db.execute(sql`
    WITH vector_ranked AS (
      SELECT
        id,
        1 - (embedding <=> ${vectorLiteral}::vector) AS cosine_similarity,
        ROW_NUMBER() OVER (ORDER BY embedding <=> ${vectorLiteral}::vector ASC) AS vec_rank
      FROM career_projects
      WHERE profile_id = ${profileId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector ASC
      LIMIT 25
    ),
    lexical_ranked AS (
      SELECT
        id,
        ts_rank_cd(
          to_tsvector(
            'english',
            coalesce(project_name, '') || ' ' ||
            coalesce(tagline, '') || ' ' ||
            coalesce(problem_statement, '') || ' ' ||
            coalesce(architecture_and_stack, '') || ' ' ||
            coalesce(tech_stack_tags::text, '')
          ),
          websearch_to_tsquery('english', ${queryText})
        ) AS lexical_score,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector(
              'english',
              coalesce(project_name, '') || ' ' ||
              coalesce(tagline, '') || ' ' ||
              coalesce(problem_statement, '') || ' ' ||
              coalesce(architecture_and_stack, '') || ' ' ||
              coalesce(tech_stack_tags::text, '')
            ),
            websearch_to_tsquery('english', ${queryText})
          ) DESC
        ) AS lex_rank
      FROM career_projects
      WHERE profile_id = ${profileId}
        AND to_tsvector(
          'english',
          coalesce(project_name, '') || ' ' ||
          coalesce(tagline, '') || ' ' ||
          coalesce(problem_statement, '') || ' ' ||
          coalesce(architecture_and_stack, '') || ' ' ||
          coalesce(tech_stack_tags::text, '')
        ) @@ websearch_to_tsquery('english', ${queryText})
      ORDER BY lexical_score DESC
      LIMIT 25
    ),
    fused AS (
      SELECT
        COALESCE(v.id, l.id) AS id,
        COALESCE(v.cosine_similarity, 0) AS cosine_similarity,
        COALESCE(l.lexical_score, 0) AS lexical_score,
        (
          COALESCE(${vectorWeight} / (60.0 + v.vec_rank), 0.0) +
          COALESCE(${lexicalWeight} / (60.0 + l.lex_rank), 0.0)
        ) AS rrf_score
      FROM vector_ranked v
      FULL OUTER JOIN lexical_ranked l ON v.id = l.id
    )
    SELECT
      cp.id,
      cp.project_name AS "projectName",
      cp.tagline,
      cp.problem_statement AS "problemStatement",
      cp.architecture_and_stack AS "architectureAndStack",
      cp.quantified_outcomes AS "quantifiedOutcomes",
      cp.highlight_bullets AS "highlightBullets",
      cp.tech_stack_tags AS "techStackTags",
      f.cosine_similarity::float8 AS "cosineSimilarity",
      f.lexical_score::float8 AS "lexicalScore",
      f.rrf_score::float8 AS "rrfScore"
    FROM fused f
    JOIN career_projects cp ON cp.id = f.id
    ORDER BY f.rrf_score DESC
    LIMIT ${limit};
  `);

  return result.rows as unknown as RankedCareerProject[];
}

export async function hybridSearchCareerStories({
  profileId,
  queryText,
  queryEmbedding,
  vectorWeight = 0.6,
  lexicalWeight = 0.4,
  limit = 6,
}: HybridSearchParams): Promise<RankedCareerStory[]> {
  const vectorLiteral = assertValidEmbeddingDimension(queryEmbedding);

  const result = await db.execute(sql`
    WITH vector_ranked AS (
      SELECT
        id,
        1 - (embedding <=> ${vectorLiteral}::vector) AS cosine_similarity,
        ROW_NUMBER() OVER (ORDER BY embedding <=> ${vectorLiteral}::vector ASC) AS vec_rank
      FROM career_stories
      WHERE profile_id = ${profileId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector ASC
      LIMIT 20
    ),
    lexical_ranked AS (
      SELECT
        id,
        ts_rank_cd(
          to_tsvector(
            'english',
            coalesce(title, '') || ' ' ||
            coalesce(situation, '') || ' ' ||
            coalesce(task, '') || ' ' ||
            coalesce(action, '') || ' ' ||
            coalesce(result, '')
          ),
          websearch_to_tsquery('english', ${queryText})
        ) AS lexical_score,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector(
              'english',
              coalesce(title, '') || ' ' ||
              coalesce(situation, '') || ' ' ||
              coalesce(task, '') || ' ' ||
              coalesce(action, '') || ' ' ||
              coalesce(result, '')
            ),
            websearch_to_tsquery('english', ${queryText})
          ) DESC
        ) AS lex_rank
      FROM career_stories
      WHERE profile_id = ${profileId}
        AND to_tsvector(
          'english',
          coalesce(title, '') || ' ' ||
          coalesce(situation, '') || ' ' ||
          coalesce(task, '') || ' ' ||
          coalesce(action, '') || ' ' ||
          coalesce(result, '')
        ) @@ websearch_to_tsquery('english', ${queryText})
      ORDER BY lexical_score DESC
      LIMIT 20
    ),
    fused AS (
      SELECT
        COALESCE(v.id, l.id) AS id,
        COALESCE(v.cosine_similarity, 0) AS cosine_similarity,
        COALESCE(l.lexical_score, 0) AS lexical_score,
        (
          COALESCE(${vectorWeight} / (60.0 + v.vec_rank), 0.0) +
          COALESCE(${lexicalWeight} / (60.0 + l.lex_rank), 0.0)
        ) AS rrf_score
      FROM vector_ranked v
      FULL OUTER JOIN lexical_ranked l ON v.id = l.id
    )
    SELECT
      cs.id,
      cs.title,
      cs.situation,
      cs.task,
      cs.action,
      cs.result,
      cs.themes,
      f.cosine_similarity::float8 AS "cosineSimilarity",
      f.lexical_score::float8 AS "lexicalScore",
      f.rrf_score::float8 AS "rrfScore"
    FROM fused f
    JOIN career_stories cs ON cs.id = f.id
    ORDER BY f.rrf_score DESC
    LIMIT ${limit};
  `);

  return result.rows as unknown as RankedCareerStory[];
}
