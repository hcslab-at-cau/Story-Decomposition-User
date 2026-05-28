export type BoundaryReason =
  | "place_change"
  | "time_change"
  | "cast_change"
  | "other"

export interface Annotation {
  annotation_id: string
  doc_id: string
  chapter_id: string
  annotator_id: string
  created_at: string
  updated_at: string
  boundary_before_pids: number[]
  boundary_sentence_ids?: string[]
  boundary_points?: Array<{
    sentence_id?: string
    pid: number
    sentence_index?: number
    global_sentence_index?: number
    sentence_text?: string
    boundary_after_pid?: number
    boundary_before_pid?: number
    paragraph_index?: number
    paragraph_text?: string
  }>
  boundary_reasons: Record<string, BoundaryReason[]>
  notes: Record<string, string>
}

export interface AnnotationProgress {
  doc_id: string
  chapter_id: string
  chapter_title: string
  paragraph_count: number
  annotators: Array<{
    annotator_id: string
    boundary_count: number
    updated_at: string
  }>
}

export interface GoldBoundary {
  boundary_before_pid: number
  votes: number
  annotator_count: number
  annotator_pids: number[]
  confidence: "unanimous" | "strong" | "majority"
  position_confidence: "high" | "medium" | "low"
}

export interface AmbiguousBoundary {
  candidate_center_pid: number
  votes: number
  annotator_count: number
  annotator_pids: number[]
  reason: "below_majority" | "conflicting_nearby_clusters"
}

export interface ConsensusGold {
  doc_id: string
  chapter_id: string
  annotator_count: number
  tolerance_for_clustering: number
  gold_boundaries: GoldBoundary[]
  ambiguous_boundaries: AmbiguousBoundary[]
  created_at: string
}
