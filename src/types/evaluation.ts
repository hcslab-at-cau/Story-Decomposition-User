export interface BoundaryMatch {
  pred: number
  gold: number
  distance: number
}

export interface BoundaryMatchResult {
  matches: BoundaryMatch[]
  falsePositives: number[]
  falseNegatives: number[]
}

export interface BoundaryMetrics {
  tolerance: number
  tp: number
  fp: number
  fn: number
  precision: number
  recall: number
  f1: number
}

export interface MethodEvaluation {
  prediction_id: string
  method: string
  label: string
  doc_id: string
  chapter_id: string
  exact: BoundaryMetrics
  tolerance_1: BoundaryMetrics
  tolerance_2: BoundaryMetrics
  mean_pred_to_gold_distance: number | null
  median_pred_to_gold_distance: number | null
  scene_count_error: number
  normalized_scene_count_error: number
  false_positives_t1: number[]
  false_negatives_t1: number[]
}

export interface HumanAgreementRow {
  doc_id: string
  chapter_id: string
  annotator_a: string
  annotator_b: string
  exact_f1: number
  tolerance_1_f1: number
}

export interface EvaluationBundle {
  created_at: string
  method_results: MethodEvaluation[]
  human_agreement: HumanAgreementRow[]
  gold_confidence_summary: Array<{
    type: string
    count: number
    ratio: number
  }>
}
