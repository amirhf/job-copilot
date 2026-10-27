import { createHash } from 'node:crypto';
import { generateObject, embedMany, embed, type LanguageModelV1, type EmbeddingModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { z } from 'zod';
import { EMBEDDING_DIMENSIONS } from '@job-copilot/db';

export type ModelTier =
  | 'TIER_1_INGESTION'
  | 'TIER_2_RUBRIC_DEFAULT'
  | 'TIER_2_RUBRIC_ESCALATED'
  | 'TIER_3_SYNTHESIS_DEFAULT'
  | 'TIER_3_SYNTHESIS_PREMIER';

export type ModelProviderName = 'google' | 'openai' | 'anthropic';

export interface ModelEndpointConfig {
  provider: ModelProviderName;
  modelId: string;
  temperature: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface TierModelConfig {
  tier: ModelTier;
  primary: ModelEndpointConfig;
  fallback: ModelEndpointConfig;
}

export const MODEL_ROUTING_TABLE: Record<ModelTier, TierModelConfig> = {
  TIER_1_INGESTION: {
    tier: 'TIER_1_INGESTION',
    primary: {
      provider: 'google',
      modelId: 'gemini-3.1-flash-lite',
      temperature: 0.0,
      thinkingLevel: 'minimal',
    },
    fallback: {
      provider: 'openai',
      modelId: 'gpt-5.4-nano',
      temperature: 0.0,
    },
  },
  TIER_2_RUBRIC_DEFAULT: {
    tier: 'TIER_2_RUBRIC_DEFAULT',
    primary: {
      provider: 'google',
      modelId: 'gemini-3.5-flash',
      temperature: 0.1,
      thinkingLevel: 'medium',
    },
    fallback: {
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      temperature: 0.1,
    },
  },
  TIER_2_RUBRIC_ESCALATED: {
    tier: 'TIER_2_RUBRIC_ESCALATED',
    primary: {
      provider: 'google',
      modelId: 'gemini-3.1-pro',
      temperature: 0.1,
      thinkingLevel: 'high',
    },
    fallback: {
      provider: 'openai',
      modelId: 'gpt-5.4',
      temperature: 0.1,
    },
  },
  TIER_3_SYNTHESIS_DEFAULT: {
    tier: 'TIER_3_SYNTHESIS_DEFAULT',
    primary: {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      temperature: 0.3,
    },
    fallback: {
      provider: 'openai',
      modelId: 'gpt-5.4',
      temperature: 0.3,
    },
  },
  TIER_3_SYNTHESIS_PREMIER: {
    tier: 'TIER_3_SYNTHESIS_PREMIER',
    primary: {
      provider: 'anthropic',
      modelId: 'claude-opus-4-6',
      temperature: 0.3,
    },
    fallback: {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      temperature: 0.3,
    },
  },
};

export const EMBEDDING_CONFIG = {
  provider: (process.env.EMBEDDING_PROVIDER ?? 'google') as 'google' | 'openai',
  modelId: process.env.EMBEDDING_MODEL_ID ?? 'gemini-embedding-001',
  dimensions: EMBEDDING_DIMENSIONS, // Locked at 768
} as const;

export function instantiateLanguageModel(endpoint: ModelEndpointConfig): LanguageModelV1 {
  switch (endpoint.provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      return google(endpoint.modelId);
    }
    case 'openai': {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      return openai(endpoint.modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(endpoint.modelId);
    }
  }
}

export function instantiateEmbeddingModel(): EmbeddingModel<string> {
  if (EMBEDDING_CONFIG.provider === 'openai') {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai.embedding(EMBEDDING_CONFIG.modelId, {
      dimensions: EMBEDDING_CONFIG.dimensions,
    });
  }
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return google.textEmbeddingModel(EMBEDDING_CONFIG.modelId, {
    outputDimensionality: EMBEDDING_CONFIG.dimensions,
  });
}

export interface StructuredGenerationOptions<TSchema extends z.ZodTypeAny> {
  tier: ModelTier;
  schema: TSchema;
  systemPrompt: string;
  /**
   * Optional static context prefix (e.g. Candidate Master Career Graph summary & verified skills)
   * placed right after systemPrompt to maximize LLM Prompt Caching hit rates (75-90% discount).
   */
  cachedStaticPrefix?: string;
  userPrompt: string;
}

export interface StructuredGenerationResult<T> {
  object: T;
  modelUsed: string;
  providerUsed: ModelProviderName;
}

export type CustomStructuredGenerator = <TSchema extends z.ZodTypeAny>(
  options: StructuredGenerationOptions<TSchema>
) => Promise<StructuredGenerationResult<z.infer<TSchema>>>;

export type CustomEmbeddingGenerator = (texts: string[]) => Promise<number[][]>;

let customStructuredGenerator: CustomStructuredGenerator | undefined;
let customEmbeddingGenerator: CustomEmbeddingGenerator | undefined;

export function setCustomStructuredGenerator(fn: CustomStructuredGenerator | undefined): void {
  customStructuredGenerator = fn;
}

export function setCustomEmbeddingGenerator(fn: CustomEmbeddingGenerator | undefined): void {
  customEmbeddingGenerator = fn;
}

export async function generateStructuredWithTier<TSchema extends z.ZodTypeAny>(
  options: StructuredGenerationOptions<TSchema>
): Promise<StructuredGenerationResult<z.infer<TSchema>>> {
  if (customStructuredGenerator) {
    return customStructuredGenerator(options);
  }

  const route = MODEL_ROUTING_TABLE[options.tier];
  const fullSystemPrompt = options.cachedStaticPrefix
    ? `${options.systemPrompt}\n\n=== CACHED CANDIDATE CONTEXT ===\n${options.cachedStaticPrefix}`
    : options.systemPrompt;

  try {
    const model = instantiateLanguageModel(route.primary);
    const { object } = await generateObject({
      model,
      schema: options.schema,
      system: fullSystemPrompt,
      prompt: options.userPrompt,
      temperature: route.primary.temperature,
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    });
    return {
      object,
      modelUsed: route.primary.modelId,
      providerUsed: route.primary.provider,
    };
  } catch (primaryError) {
    const fallbackModel = instantiateLanguageModel(route.fallback);
    const { object } = await generateObject({
      model: fallbackModel,
      schema: options.schema,
      system: fullSystemPrompt,
      prompt: options.userPrompt,
      temperature: route.fallback.temperature,
    });
    return {
      object,
      modelUsed: route.fallback.modelId,
      providerUsed: route.fallback.provider,
    };
  }
}

/**
 * Deterministic 768-dim unit vector generator used when running offline tests or when no embedding API key is configured.
 */
export function computeDeterministicFallbackEmbedding(text: string): number[] {
  const vector: number[] = new Array(EMBEDDING_DIMENSIONS);
  let normSq = 0;

  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const digest = createHash('sha256')
      .update(`${i}::${text.trim().toLowerCase()}`)
      .digest();
    const rawInt = digest.readInt32BE(0);
    const val = rawInt / 0x7fffffff;
    vector[i] = val;
    normSq += val * val;
  }

  const norm = Math.sqrt(normSq) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (customEmbeddingGenerator) {
    const vectors = await customEmbeddingGenerator(texts);
    for (const v of vectors) {
      if (v.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${v.length}`
        );
      }
    }
    return vectors;
  }

  const hasApiKey =
    (EMBEDDING_CONFIG.provider === 'google' && Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)) ||
    (EMBEDDING_CONFIG.provider === 'openai' && Boolean(process.env.OPENAI_API_KEY));

  if (!hasApiKey) {
    return texts.map((t) => computeDeterministicFallbackEmbedding(t));
  }

  const model = instantiateEmbeddingModel();
  const { embeddings } = await embedMany({
    model,
    values: texts,
  });

  return embeddings.map((vec) => {
    if (vec.length === EMBEDDING_DIMENSIONS) return vec;
    if (vec.length > EMBEDDING_DIMENSIONS) {
      // MRL truncation + L2 renormalization to 768 dimensions
      const sliced = vec.slice(0, EMBEDDING_DIMENSIONS);
      const norm = Math.sqrt(sliced.reduce((sum, x) => sum + x * x, 0)) || 1;
      return sliced.map((x) => x / norm);
    }
    throw new Error(
      `Provider returned embedding with ${vec.length} dimensions, which is less than required ${EMBEDDING_DIMENSIONS}`
    );
  });
}

export async function generateSingleEmbedding(text: string): Promise<number[]> {
  if (customEmbeddingGenerator) {
    const [first] = await generateEmbeddingsBatch([text]);
    if (!first) throw new Error('Failed to generate embedding');
    return first;
  }

  const hasApiKey =
    (EMBEDDING_CONFIG.provider === 'google' && Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)) ||
    (EMBEDDING_CONFIG.provider === 'openai' && Boolean(process.env.OPENAI_API_KEY));

  if (!hasApiKey) {
    return computeDeterministicFallbackEmbedding(text);
  }

  const model = instantiateEmbeddingModel();
  const { embedding } = await embed({
    model,
    value: text,
  });

  if (embedding.length > EMBEDDING_DIMENSIONS) {
    const sliced = embedding.slice(0, EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(sliced.reduce((sum, x) => sum + x * x, 0)) || 1;
    return sliced.map((x) => x / norm);
  }

  return embedding;
}
