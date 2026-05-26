import type { ConsensusGold } from "@/types/annotation"
import type { EvaluationBundle, MethodEvaluation } from "@/types/evaluation"
import type { Prediction } from "@/types/prediction"

import {
  boundaryMetrics,
  matchBoundaries,
  mean,
  median,
  nearestDistances,
} from "@/lib/evaluation/boundary-match"
import { humanAgreementRows } from "@/lib/evaluation/human-agreement"
import type { Annotation } from "@/types/annotation"

export function evaluatePredictions(
  predictions: Prediction[],
  consensusGold: ConsensusGold[],
  annotations: Annotation[],
): EvaluationBundle {
  const consensusByChapter = new Map(
    consensusGold.map((consensus) => [`${consensus.doc_id}__${consensus.chapter_id}`, consensus]),
  )

  const method_results = predictions.flatMap((prediction) => {
    const consensus = consensusByChapter.get(`${prediction.doc_id}__${prediction.chapter_id}`)
    return consensus ? [evaluatePrediction(prediction, consensus)] : []
  })

  return {
    created_at: new Date().toISOString(),
    method_results,
    human_agreement: humanAgreementRows(annotations),
    gold_confidence_summary: summarizeGoldConfidence(consensusGold),
  }
}

function evaluatePrediction(prediction: Prediction, consensus: ConsensusGold): MethodEvaluation {
  const gold = consensus.gold_boundaries.map((boundary) => boundary.boundary_before_pid)
  const exact = boundaryMetrics(prediction.boundary_before_pids, gold, 0)
  const tolerance_1 = boundaryMetrics(prediction.boundary_before_pids, gold, 1)
  const tolerance_2 = boundaryMetrics(prediction.boundary_before_pids, gold, 2)
  const t1Match = matchBoundaries(prediction.boundary_before_pids, gold, 1)
  const distances = nearestDistances(prediction.boundary_before_pids, gold)
  const predictedSceneCount = prediction.boundary_before_pids.length + 1
  const goldSceneCount = gold.length + 1

  return {
    prediction_id: prediction.prediction_id,
    method: prediction.method,
    label: prediction.label,
    doc_id: prediction.doc_id,
    chapter_id: prediction.chapter_id,
    exact,
    tolerance_1,
    tolerance_2,
    mean_pred_to_gold_distance: mean(distances),
    median_pred_to_gold_distance: median(distances),
    scene_count_error: Math.abs(predictedSceneCount - goldSceneCount),
    normalized_scene_count_error:
      goldSceneCount === 0 ? 0 : Math.abs(predictedSceneCount - goldSceneCount) / goldSceneCount,
    false_positives_t1: t1Match.falsePositives,
    false_negatives_t1: t1Match.falseNegatives,
  }
}

function summarizeGoldConfidence(consensusGold: ConsensusGold[]) {
  const counts = new Map<string, number>()
  let total = 0

  for (const consensus of consensusGold) {
    for (const boundary of consensus.gold_boundaries) {
      counts.set(boundary.confidence, (counts.get(boundary.confidence) ?? 0) + 1)
      total += 1
    }
    if (consensus.ambiguous_boundaries.length > 0) {
      counts.set(
        "ambiguous_excluded",
        (counts.get("ambiguous_excluded") ?? 0) + consensus.ambiguous_boundaries.length,
      )
      total += consensus.ambiguous_boundaries.length
    }
  }

  return Array.from(counts)
    .map(([type, count]) => ({
      type,
      count,
      ratio: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => a.type.localeCompare(b.type))
}
