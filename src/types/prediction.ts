export type PredictionMethod =
  | "fixed_size"
  | "scene_aware_state3"
  | "llm_text_only"
  | "manual_import"

export interface BoundaryCandidate {
  boundary_before_pid: number
  score?: number
  label?: "scene_boundary" | "weak_boundary_candidate"
  reasons?: Array<Record<string, unknown>>
}

export interface SceneSpan {
  scene_id: string
  start_pid: number
  end_pid: number
}

export interface Prediction {
  prediction_id: string
  method: PredictionMethod | string
  label: string
  doc_id: string
  chapter_id: string
  boundary_before_pids: number[]
  boundaries?: BoundaryCandidate[]
  scenes?: SceneSpan[]
  params?: Record<string, unknown>
  created_at: string
}
