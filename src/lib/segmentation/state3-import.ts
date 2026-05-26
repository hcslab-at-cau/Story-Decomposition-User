import type { BoundaryCandidate, Prediction } from "@/types/prediction"

import { compactId, uniqueSortedNumbers } from "@/lib/ids"
import { scenesToBoundaries } from "@/lib/segmentation/boundaries"

type ImportedState3 = {
  boundaries?: Array<{
    boundary_before_pid: number
    label?: string
    score?: number
    reasons?: Array<Record<string, unknown>>
  }>
  scenes?: Array<{
    scene_id: string
    start_pid: number
    end_pid: number
  }>
}

export function state3ToPrediction(docId: string, chapterId: string, raw: unknown): Prediction {
  const state3 = raw as ImportedState3
  const scenes = Array.isArray(state3.scenes) ? state3.scenes : undefined
  const boundaries: BoundaryCandidate[] | undefined = Array.isArray(state3.boundaries)
    ? state3.boundaries.map((boundary) => ({
        boundary_before_pid: boundary.boundary_before_pid,
        score: boundary.score,
        reasons: boundary.reasons,
        label:
          boundary.label === "scene_boundary" || boundary.label === "weak_boundary_candidate"
            ? boundary.label
            : undefined,
      }))
    : undefined

  const boundary_before_pids =
    scenes && scenes.length > 0
      ? scenesToBoundaries(scenes)
      : uniqueSortedNumbers(
          boundaries
            ?.filter((boundary) => boundary.label === undefined || boundary.label === "scene_boundary")
            .map((boundary) => boundary.boundary_before_pid) ?? [],
        )

  return {
    prediction_id: compactId(`state3_${docId}_${chapterId}`),
    method: "scene_aware_state3",
    label: "Ours: scene-aware STATE.3",
    doc_id: docId,
    chapter_id: chapterId,
    boundary_before_pids,
    boundaries,
    scenes,
    params: { source: "STATE.3 import" },
    created_at: new Date().toISOString(),
  }
}
