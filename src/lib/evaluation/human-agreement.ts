import type { Annotation } from "@/types/annotation"
import type { HumanAgreementRow } from "@/types/evaluation"

import { boundaryMetrics } from "@/lib/evaluation/boundary-match"
import { isTestParticipantId } from "@/lib/participants"

export function humanAgreementRows(annotations: Annotation[]): HumanAgreementRow[] {
  const grouped = new Map<string, Annotation[]>()

  for (const annotation of annotations) {
    if (isTestParticipantId(annotation.annotator_id)) {
      continue
    }

    const key = `${annotation.doc_id}__${annotation.chapter_id}`
    grouped.set(key, [...(grouped.get(key) ?? []), annotation])
  }

  const rows: HumanAgreementRow[] = []

  for (const chapterAnnotations of grouped.values()) {
    const sorted = [...chapterAnnotations].sort((a, b) => a.annotator_id.localeCompare(b.annotator_id))

    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i]
        const b = sorted[j]
        rows.push({
          doc_id: a.doc_id,
          chapter_id: a.chapter_id,
          annotator_a: a.annotator_id,
          annotator_b: b.annotator_id,
          exact_f1: boundaryMetrics(a.boundary_before_pids, b.boundary_before_pids, 0).f1,
          tolerance_1_f1: boundaryMetrics(a.boundary_before_pids, b.boundary_before_pids, 1).f1,
        })
      }
    }
  }

  return rows
}
