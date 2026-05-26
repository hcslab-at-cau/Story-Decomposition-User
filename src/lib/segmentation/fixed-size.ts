import type { Chapter } from "@/types/document"
import type { Prediction } from "@/types/prediction"

import { compactId } from "@/lib/ids"
import { boundariesToScenes } from "@/lib/segmentation/boundaries"

export function fixedSizePrediction(docId: string, chapter: Chapter, k: number): Prediction {
  const paragraphPids = chapter.paragraphs
    .filter((paragraph) => paragraph.is_narrative !== false)
    .map((paragraph) => paragraph.pid)
    .sort((a, b) => a - b)
  const boundary_before_pids = paragraphPids.filter((_, index) => index > 0 && index % k === 0)

  return {
    prediction_id: compactId(`fixed_${docId}_${chapter.chapter_id}`),
    method: "fixed_size",
    label: `Fixed size k=${k}`,
    doc_id: docId,
    chapter_id: chapter.chapter_id,
    boundary_before_pids,
    scenes: boundariesToScenes(paragraphPids, boundary_before_pids),
    params: { k },
    created_at: new Date().toISOString(),
  }
}
