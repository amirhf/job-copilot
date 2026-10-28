import {
  Stage2RubricOutputSchema,
  type Stage2RubricOutput,
  type RubricWeightsConfig,
  type FlaggedSkillGap,
} from '@job-copilot/db';
import { generateStructuredWithTier } from '../routers/model-router';
import {
  RUBRIC_SCORING_SYSTEM_PROMPT,
  buildStaticCandidateCachePrefix,
  buildJobRubricUserPrompt,
  type StaticCandidateCachePayload,
  type JobSpecificRubricPromptPayload,
} from '../prompts/rubric-scoring';

export function computeWeightedOverallScore(
  categoryScores: Stage2RubricOutput['categoryScores'],
  weights: RubricWeightsConfig,
  preferencePenaltyPoints = 0
): number {
  const totalWeight =
    weights.techStackAlignment +
    weights.seniorityAndScope +
    weights.domainIndustryFit +
    weights.companyStageCulture;

  const safeDenominator = totalWeight > 0 ? totalWeight : 100;

  const weightedSum =
    categoryScores.techStackAlignment.score * weights.techStackAlignment +
    categoryScores.seniorityAndScope.score * weights.seniorityAndScope +
    categoryScores.domainIndustryFit.score * weights.domainIndustryFit +
    categoryScores.companyStageCulture.score * weights.companyStageCulture;

  const rawScore = Math.round(weightedSum / safeDenominator) + preferencePenaltyPoints;
  return Math.max(0, Math.min(100, rawScore));
}

export function shouldEscalateToProEvaluator(
  overallScore: number,
  flaggedGaps: Array<{ severity: 'CRITICAL' | 'MODERATE' | 'MINOR' }>
): boolean {
  const isBorderlineBand = overallScore >= 68 && overallScore <= 78;
  const hasCriticalGap = flaggedGaps.some((g) => g.severity === 'CRITICAL');
  return isBorderlineBand && hasCriticalGap;
}

export interface EvaluateStage2RubricParams {
  candidateStaticContext: StaticCandidateCachePayload;
  jobContext: JobSpecificRubricPromptPayload;
  rubricWeights: RubricWeightsConfig;
  allowBorderlineEscalation?: boolean;
}

export interface EvaluateStage2RubricResult {
  overallScore: number;
  categoryScoresWithWeights: {
    techStackAlignment: { score: number; weight: number; rationale: string };
    seniorityAndScope: { score: number; weight: number; rationale: string };
    domainIndustryFit: { score: number; weight: number; rationale: string };
    companyStageCulture: { score: number; weight: number; rationale: string };
  };
  executiveSummary: string;
  topMatchedBlockIds: Stage2RubricOutput['topMatchedBlockIds'];
  flaggedGaps: FlaggedSkillGap[];
  hasUnresolvedCriticalGap: boolean;
  evaluatorModelUsed: string;
  escalatedToPro: boolean;
}

export async function evaluateStage2Rubric(
  params: EvaluateStage2RubricParams
): Promise<EvaluateStage2RubricResult> {
  const cachedStaticPrefix = buildStaticCandidateCachePrefix(params.candidateStaticContext);
  const userPrompt = buildJobRubricUserPrompt(params.jobContext);

  // 1. Default Tier 2 Evaluation (Gemini 3.5 Flash / GPT-5.4-mini)
  let { object, modelUsed } = await generateStructuredWithTier({
    tier: 'TIER_2_RUBRIC_DEFAULT',
    schema: Stage2RubricOutputSchema,
    systemPrompt: RUBRIC_SCORING_SYSTEM_PROMPT,
    cachedStaticPrefix,
    userPrompt,
  });

  let overallScore = computeWeightedOverallScore(
    object.categoryScores,
    params.rubricWeights,
    object.preferencePenaltyPoints
  );
  let escalatedToPro = false;

  // 2. Borderline Escalation Check -> Escalate to Gemini 3.1 Pro / GPT-5.4 if in uncertainty band [68, 78] with CRITICAL gap
  if (
    (params.allowBorderlineEscalation ?? true) &&
    shouldEscalateToProEvaluator(overallScore, object.flaggedGaps)
  ) {
    const escalated = await generateStructuredWithTier({
      tier: 'TIER_2_RUBRIC_ESCALATED',
      schema: Stage2RubricOutputSchema,
      systemPrompt: RUBRIC_SCORING_SYSTEM_PROMPT,
      cachedStaticPrefix,
      userPrompt,
    });
    object = escalated.object;
    modelUsed = escalated.modelUsed;
    overallScore = computeWeightedOverallScore(
      object.categoryScores,
      params.rubricWeights,
      object.preferencePenaltyPoints
    );
    escalatedToPro = true;
  }

  const normalizedFlaggedGaps: FlaggedSkillGap[] = object.flaggedGaps.map((g) => ({
    ...g,
    resolutionStatus: 'OPEN',
  }));

  const hasUnresolvedCriticalGap = normalizedFlaggedGaps.some(
    (g) => g.severity === 'CRITICAL' && g.resolutionStatus === 'OPEN'
  );

  return {
    overallScore,
    categoryScoresWithWeights: {
      techStackAlignment: {
        score: object.categoryScores.techStackAlignment.score,
        weight: params.rubricWeights.techStackAlignment,
        rationale: object.categoryScores.techStackAlignment.rationale,
      },
      seniorityAndScope: {
        score: object.categoryScores.seniorityAndScope.score,
        weight: params.rubricWeights.seniorityAndScope,
        rationale: object.categoryScores.seniorityAndScope.rationale,
      },
      domainIndustryFit: {
        score: object.categoryScores.domainIndustryFit.score,
        weight: params.rubricWeights.domainIndustryFit,
        rationale: object.categoryScores.domainIndustryFit.rationale,
      },
      companyStageCulture: {
        score: object.categoryScores.companyStageCulture.score,
        weight: params.rubricWeights.companyStageCulture,
        rationale: object.categoryScores.companyStageCulture.rationale,
      },
    },
    executiveSummary: object.executiveSummary,
    topMatchedBlockIds: object.topMatchedBlockIds,
    flaggedGaps: normalizedFlaggedGaps,
    hasUnresolvedCriticalGap,
    evaluatorModelUsed: modelUsed,
    escalatedToPro,
  };
}
