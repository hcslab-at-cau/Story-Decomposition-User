import { NextResponse } from "next/server"

import { getConsensus, getDocument, listAnnotations } from "@/lib/data/fs-store"
import { uniqueSortedNumbers } from "@/lib/ids"
import { isTestParticipantId } from "@/lib/participants"
import type { Annotation, AmbiguousBoundary, GoldBoundary } from "@/types/annotation"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const docId = url.searchParams.get("doc_id")?.trim() ?? ""
  const chapterId = url.searchParams.get("chapter_id")?.trim() ?? ""

  if (!docId || !chapterId) {
    return NextResponse.json({ error: "doc_id and chapter_id are required" }, { status: 400 })
  }

  const consensus = await getConsensus(docId, chapterId)

  if (!consensus) {
    return NextResponse.json({ error: "Consensus gold not found. Build consensus first." }, { status: 404 })
  }

  const document = await getDocument(docId)
  const chapter = document?.chapters.find((item) => item.chapter_id === chapterId)
  const annotations = (await listAnnotations()).filter(
    (annotation) =>
      annotation.doc_id === docId &&
      annotation.chapter_id === chapterId &&
      !isTestParticipantId(annotation.annotator_id),
  )
  const annotatorIds = Array.from(new Set(annotations.map((annotation) => annotation.annotator_id))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const payload = {
    schema: "scene_boundary_gold.v1",
    doc_id: docId,
    document_title: document?.title ?? docId,
    chapter_id: chapterId,
    chapter_title: chapter?.title ?? chapterId,
    paragraph_count: chapter?.paragraphs.length ?? null,
    annotator_count: consensus.annotator_count,
    evidence_annotator_count: annotatorIds.length,
    evidence_annotator_ids: annotatorIds,
    tolerance_for_clustering: consensus.tolerance_for_clustering,
    boundary_before_pids: consensus.gold_boundaries.map((boundary) => boundary.boundary_before_pid),
    gold_boundaries: consensus.gold_boundaries.map((boundary) =>
      goldBoundaryWithEvidence(boundary, annotations, annotatorIds),
    ),
    ambiguous_boundaries: consensus.ambiguous_boundaries.map((boundary) =>
      ambiguousBoundaryWithEvidence(boundary, annotations, annotatorIds),
    ),
    source_annotations: annotations.map(annotationEvidenceSummary),
    created_at: consensus.created_at,
    exported_at: new Date().toISOString(),
  }
  const utf8FileName = `${safeFileName(document?.title ?? docId)}__${safeFileName(chapterId)}__gold_boundaries.json`
  const fallbackFileName = `${safeAsciiFileName(docId)}__${safeAsciiFileName(chapterId)}__gold_boundaries.json`

  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      "Content-Disposition": contentDispositionAttachment(fallbackFileName, utf8FileName),
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

function safeFileName(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80)
}

function goldBoundaryWithEvidence(
  boundary: GoldBoundary,
  annotations: Annotation[],
  annotatorIds: string[],
) {
  const evidence = evidenceForPids(boundary.annotator_pids, annotations)
  const supportingAnnotatorIds = new Set(evidence.map((item) => item.annotator_id))

  return {
    ...boundary,
    evidence,
    supporting_annotator_ids: Array.from(supportingAnnotatorIds).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
    non_supporting_annotator_ids: annotatorIds.filter((annotatorId) => !supportingAnnotatorIds.has(annotatorId)),
  }
}

function ambiguousBoundaryWithEvidence(
  boundary: AmbiguousBoundary,
  annotations: Annotation[],
  annotatorIds: string[],
) {
  const evidence = evidenceForPids(boundary.annotator_pids, annotations)
  const supportingAnnotatorIds = new Set(evidence.map((item) => item.annotator_id))

  return {
    ...boundary,
    evidence,
    supporting_annotator_ids: Array.from(supportingAnnotatorIds).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
    non_supporting_annotator_ids: annotatorIds.filter((annotatorId) => !supportingAnnotatorIds.has(annotatorId)),
  }
}

function annotationEvidenceSummary(annotation: Annotation) {
  return {
    annotator_id: annotation.annotator_id,
    annotation_id: annotation.annotation_id,
    status: annotation.status ?? null,
    updated_at: annotation.updated_at,
    submitted_at: annotation.submitted_at ?? null,
    boundary_count: annotation.boundary_before_pids.length,
    boundary_before_pids: annotation.boundary_before_pids,
    boundaries: uniqueSortedNumbers(annotation.boundary_before_pids).map((pid) =>
      boundaryEvidence(annotation, pid),
    ),
  }
}

function evidenceForPids(pids: number[], annotations: Annotation[]) {
  const pidSet = new Set(pids)

  return annotations.flatMap((annotation) =>
    uniqueSortedNumbers(annotation.boundary_before_pids)
      .filter((pid) => pidSet.has(pid))
      .map((pid) => boundaryEvidence(annotation, pid)),
  )
}

function boundaryEvidence(annotation: Annotation, pid: number) {
  const key = String(pid)
  const boundaryPoint = annotation.boundary_points?.find(
    (point) => point.pid === pid || point.boundary_before_pid === pid,
  )

  return {
    annotator_id: annotation.annotator_id,
    boundary_before_pid: pid,
    reasons: annotation.boundary_reasons[key] ?? [],
    reason_flags: annotation.boundary_reason_flags?.[key] ?? boundaryPoint?.reason_flags ?? [],
    note: annotation.notes[key] ?? "",
    paragraph_index: boundaryPoint?.paragraph_index ?? boundaryPoint?.start_para_order ?? null,
    paragraph_text: boundaryPoint?.paragraph_text ?? null,
    sentence_id: boundaryPoint?.sentence_id ?? null,
    sentence_text: boundaryPoint?.sentence_text ?? null,
    updated_at: annotation.updated_at,
    boundary_point: boundaryPoint ?? null,
  }
}

function safeAsciiFileName(value: string) {
  const safeValue = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "")
  return safeValue || "gold"
}

function contentDispositionAttachment(fallbackFileName: string, utf8FileName: string) {
  return `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeRfc5987Value(utf8FileName)}`
}

function encodeRfc5987Value(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}
