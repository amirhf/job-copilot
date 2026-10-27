import { describe, it, expect, afterEach } from 'vitest';
import {
  MODEL_ROUTING_TABLE,
  EMBEDDING_CONFIG,
  generateEmbeddingsBatch,
  generateStructuredWithTier,
  setCustomStructuredGenerator,
  setCustomEmbeddingGenerator,
  parseCareerDocumentText,
  enforceEvidenceIntegrity,
  extractCareerDocumentBlocks,
  normalizeSkillSlug,
  cosineSimilarity,
  isDuplicateBullet,
  doExperienceDatesOverlap,
} from '../index';

afterEach(() => {
  setCustomStructuredGenerator(undefined);
  setCustomEmbeddingGenerator(undefined);
});

describe('@job-copilot/agents Model Router & Career Graph Ingestion (Milestone 2)', () => {
  it('configures 5 model routing tiers and locks EMBEDDING_CONFIG to 768 dimensions', () => {
    expect(EMBEDDING_CONFIG.dimensions).toBe(768);
    expect(MODEL_ROUTING_TABLE.TIER_1_INGESTION.primary.modelId).toBe('gemini-3.1-flash-lite');
    expect(MODEL_ROUTING_TABLE.TIER_2_RUBRIC_DEFAULT.primary.modelId).toBe('gemini-3.5-flash');
    expect(MODEL_ROUTING_TABLE.TIER_2_RUBRIC_ESCALATED.primary.modelId).toBe('gemini-3.1-pro');
    expect(MODEL_ROUTING_TABLE.TIER_3_SYNTHESIS_DEFAULT.primary.modelId).toBe('claude-sonnet-4-6');
    expect(MODEL_ROUTING_TABLE.TIER_3_SYNTHESIS_PREMIER.primary.modelId).toBe('claude-opus-4-6');
  });

  it('generates deterministic 768-dimension unit vectors in offline mode', async () => {
    const vectors = await generateEmbeddingsBatch([
      'Built distributed multi-agent workflow engine in TypeScript',
      'Designed PostgreSQL pgvector HNSW hybrid retrieval layer',
    ]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(768);
    expect(vectors[1]).toHaveLength(768);

    // Self-similarity is ~1.0, distinct strings have low similarity
    expect(cosineSimilarity(vectors[0]!, vectors[0]!)).toBeCloseTo(1.0, 4);
    expect(cosineSimilarity(vectors[0]!, vectors[1]!)).toBeLessThan(0.2);
  });

  it('normalizes HTML and Markdown career documents and computes stable SHA-256 hashes', () => {
    const htmlDoc = parseCareerDocumentText({
      title: 'Portfolio Page',
      rawTextOrMarkdown: `
        <html>
          <head><style>body { color: red; }</style></head>
          <body>
            <h1>Alex Rivera</h1>
            <h2>Staff Systems Engineer</h2>
            <ul>
              <li>Scaled event pipeline to 25,000 msgs/sec with <a href="https://kafka.apache.org">Kafka</a></li>
            </ul>
          </body>
        </html>
      `,
      isHtml: true,
    });

    expect(htmlDoc.cleanMarkdown).toContain('# Alex Rivera');
    expect(htmlDoc.cleanMarkdown).toContain('- Scaled event pipeline to 25,000 msgs/sec with Kafka (https://kafka.apache.org)');
    expect(htmlDoc.contentHash).toHaveLength(64);

    // Identical content produces identical SHA-256 hash regardless of trailing spaces
    const markdownCopy = parseCareerDocumentText({
      title: 'Portfolio Copy',
      rawTextOrMarkdown: htmlDoc.cleanMarkdown + '   \r\n\r\n',
    });
    expect(markdownCopy.contentHash).toBe(htmlDoc.contentHash);
  });

  it('enforces Zero-Hallucination skill evidence integrity and demotes orphan skill links', async () => {
    setCustomStructuredGenerator(async () => ({
      modelUsed: 'gemini-3.1-flash-lite',
      providerUsed: 'google',
      object: {
        experiences: [
          {
            tempExperienceId: 'exp_1',
            companyName: 'Stripe',
            normalizedCompanyName: 'stripe',
            jobTitle: 'Senior Software Engineer',
            employmentType: 'FULL_TIME',
            remotePolicy: 'HYBRID',
            startDate: '2022-03-01',
            endDate: null,
            isCurrent: true,
            roleOverview: 'Built real-time payment ledger services.',
            domainTags: ['fintech', 'payments'],
            primaryTechStack: ['TypeScript', 'PostgreSQL'],
            bullets: [
              {
                tempBulletId: 'exp_1_b_1',
                bulletText: 'Cut ledger settlement latency by 38% via partitioned PostgreSQL tables.',
                actionVerb: 'Cut',
                quantifiedMetrics: [
                  {
                    metric: 'ledger settlement latency',
                    value: '38%',
                    isExactFromSource: true as const,
                  },
                ],
                skillTags: ['PostgreSQL'],
                impactScore: 90,
              },
            ],
          },
        ],
        projects: [],
        stories: [],
        skills: [
          {
            name: 'Postgres',
            normalizedSlug: 'postgres',
            aliases: ['pg'],
            category: 'DATABASE_STORAGE',
            proficiency: 'EXPERT',
            adjacentSkillSlugs: ['mysql'],
            evidenceLinks: [
              {
                sourceBlockTempId: 'exp_1_b_1',
                verbatimEvidenceExcerpt:
                  'Cut ledger settlement latency by 38% via partitioned PostgreSQL tables.',
              },
            ],
          },
          {
            // Hallucinated/orphan temp ID that does not exist in experiences/projects/stories
            name: ' Elixir ',
            normalizedSlug: 'elixir',
            aliases: [],
            category: 'LANGUAGE',
            proficiency: 'FAMILIAR',
            adjacentSkillSlugs: ['erlang'],
            evidenceLinks: [
              {
                sourceBlockTempId: 'non_existent_block_999',
                verbatimEvidenceExcerpt: 'Listed in footer',
              },
            ],
          },
        ],
        unverifiedSkillMentions: ['Terraform'],
      },
    }));

    const result = await extractCareerDocumentBlocks({
      sourceTitle: 'Resume_2026.pdf',
      sourceType: 'RESUME_UPLOAD',
      rawMarkdownContent: '# Alex Rivera\nSenior Software Engineer at Stripe...',
    });

    expect(result.extraction.skills).toHaveLength(1);
    expect(result.extraction.skills[0]?.normalizedSlug).toBe('postgresql');
    expect(result.reclassifiedOrphanSkills).toEqual([' Elixir ']);
    expect(result.extraction.unverifiedSkillMentions).toEqual(['Terraform', ' Elixir ']);
  });

  it('accurately detects overlapping experience dates and duplicate bullets (>0.92 cosine)', () => {
    expect(
      doExperienceDatesOverlap(
        { startDate: '2022-01-01', endDate: '2024-06-01' },
        { startDate: '2023-01-01', endDate: null }
      )
    ).toBe(true);

    expect(
      doExperienceDatesOverlap(
        { startDate: '2019-01-01', endDate: '2021-05-01' },
        { startDate: '2022-01-01', endDate: null }
      )
    ).toBe(false);

    const baseVec = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
    const nearlyIdenticalVec = Array.from({ length: 768 }, (_, i) =>
      i === 0 ? 0.98 : i === 1 ? 0.19 : 0
    );
    const orthogonalVec = Array.from({ length: 768 }, (_, i) => (i === 2 ? 1 : 0));

    expect(
      isDuplicateBullet({
        candidateText: 'New phrasing of same achievement',
        candidateEmbedding: nearlyIdenticalVec,
        existingBullets: [{ bulletText: 'Original achievement', embedding: baseVec }],
      })
    ).toBe(true);

    expect(
      isDuplicateBullet({
        candidateText: 'Completely distinct architecture achievement',
        candidateEmbedding: orthogonalVec,
        existingBullets: [{ bulletText: 'Original achievement', embedding: baseVec }],
      })
    ).toBe(false);

    expect(normalizeSkillSlug('Next.js')).toBe('nextjs');
    expect(normalizeSkillSlug('K8s')).toBe('kubernetes');
  });
});
