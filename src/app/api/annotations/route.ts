import { NextResponse } from "next/server"

import { getAnnotation, listAnnotations, saveAnnotation } from "@/lib/data/fs-store"
import { compactId, uniqueSortedNumbers } from "@/lib/ids"
import { isStudyResultsEnabled, saveAnnotationTaskResponse } from "@/lib/study-results"
import type { Annotation, BoundaryReason, BoundaryReasonFlag } from "@/types/annotation"
import type { DeviceInfo, StudyCondition } from "@/types/study-results"

export const runtime = "nodejs"

const VALID_BOUNDARY_REASONS = new Set<BoundaryReason>([
  "place_change",
  "time_change",
  "cast_change",
  "other",
])
const VALID_STUDY_CONDITIONS = new Set<StudyCondition>(["control", "on_demand", "auto_trigger"])
const VALID_BOUNDARY_REASON_FLAGS = new Set<BoundaryReasonFlag>([
  "PLACE_SHIFT",
  "TIME_SHIFT",
  "CAST_SHIFT",
  "OTHER",
])

export async function GET(request: Request) {
  const url = new URL(request.url)
  const docId = url.searchParams.get("docId")
  const chapterId = url.searchParams.get("chapterId")
  const annotatorId = url.searchParams.get("annotatorId")

  if (docId && chapterId && annotatorId) {
    const annotation = await getAnnotation(docId, chapterId, annotatorId)
    return NextResponse.json({ annotation })
  }

  const annotations = await listAnnotations()
  return NextResponse.json({ annotations })
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    doc_id?: string
    chapter_id?: string
    text_id?: string
    annotator_id?: string
    started_at?: string
    submitted_at?: string
    duration_ms?: number
    status?: Annotation["status"]
    dataset_version?: string
    guideline_version?: string
    ui_version?: string
    boundary_count?: number
    paragraph_count?: number
    boundary_before_pids?: number[]
    boundary_sentence_ids?: string[]
    boundary_points?: Annotation["boundary_points"]
    boundary_reasons?: Record<string, BoundaryReason | BoundaryReason[]>
    boundary_reason_flags?: Annotation["boundary_reason_flags"]
    notes?: Record<string, string>
    study_session?: {
      study_id?: string
      session_id?: string
      condition?: StudyCondition
      task_id?: string
      assigned_order?: number
      start_time?: string
      device_info?: DeviceInfo
    }
  }

  if (!body.doc_id || !body.chapter_id || !body.annotator_id) {
    return NextResponse.json({ error: "doc_id, chapter_id, and annotator_id are required" }, { status: 400 })
  }

  const existing = await getAnnotation(body.doc_id, body.chapter_id, body.annotator_id)
  const now = new Date().toISOString()
  const boundaryBeforePids = uniqueSortedNumbers(body.boundary_before_pids ?? [])
  const annotation: Annotation = {
    annotation_id: existing?.annotation_id ?? compactId(`${body.doc_id}_${body.chapter_id}_${body.annotator_id}`),
    doc_id: body.doc_id,
    chapter_id: body.chapter_id,
    text_id: body.text_id ?? existing?.text_id,
    annotator_id: body.annotator_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    started_at: body.started_at ?? existing?.started_at ?? now,
    submitted_at: body.submitted_at ?? existing?.submitted_at,
    duration_ms: body.duration_ms ?? existing?.duration_ms,
    status: body.status ?? "submitted",
    dataset_version: body.dataset_version ?? existing?.dataset_version,
    guideline_version: body.guideline_version ?? existing?.guideline_version,
    ui_version: body.ui_version ?? existing?.ui_version,
    boundary_count: body.boundary_count ?? boundaryBeforePids.length,
    paragraph_count: body.paragraph_count ?? existing?.paragraph_count,
    boundary_before_pids: boundaryBeforePids,
    boundary_sentence_ids: body.boundary_sentence_ids ?? [],
    boundary_points: body.boundary_points ?? [],
    boundary_reasons: normalizeBoundaryReasonRecord(body.boundary_reasons ?? {}),
    boundary_reason_flags: normalizeBoundaryReasonFlagRecord(body.boundary_reason_flags ?? {}),
    notes: body.notes ?? {},
  }

  await saveAnnotation(annotation)
  if (isStudyResultsEnabled()) {
    await saveAnnotationTaskResponse({
      studyId: body.study_session?.study_id,
      participantId: body.annotator_id,
      sessionId: body.study_session?.session_id ?? annotation.annotation_id,
      condition: normalizeStudyCondition(body.study_session?.condition),
      bookId: body.doc_id,
      chapterId: body.chapter_id,
      taskId: body.study_session?.task_id,
      assignedOrder: body.study_session?.assigned_order,
      startTime: body.study_session?.start_time,
      deviceInfo: body.study_session?.device_info,
      annotation,
    })
  }

  return NextResponse.json({ annotation })
}

function normalizeBoundaryReasonRecord(record: Record<string, BoundaryReason | BoundaryReason[]>) {
  const normalized: Record<string, BoundaryReason[]> = {}

  for (const [key, value] of Object.entries(record)) {
    const reasons = normalizeBoundaryReasons(value)

    if (reasons.length > 0) {
      normalized[key] = reasons
    }
  }

  return normalized
}

function normalizeBoundaryReasons(value: BoundaryReason | BoundaryReason[]) {
  const rawReasons = Array.isArray(value) ? value : [value]
  const validReasons = rawReasons.filter((reason): reason is BoundaryReason => VALID_BOUNDARY_REASONS.has(reason))

  if (validReasons.includes("other")) {
    return ["other" as const]
  }

  return ["place_change", "time_change", "cast_change"].filter((reason) =>
    validReasons.includes(reason as BoundaryReason),
  ) as BoundaryReason[]
}

function normalizeBoundaryReasonFlagRecord(record: Record<string, BoundaryReasonFlag[]>) {
  const normalized: Record<string, BoundaryReasonFlag[]> = {}

  for (const [key, value] of Object.entries(record)) {
    const flags = normalizeBoundaryReasonFlags(value)

    if (flags.length > 0) {
      normalized[key] = flags
    }
  }

  return normalized
}

function normalizeBoundaryReasonFlags(value: BoundaryReasonFlag[]) {
  const validFlags = value.filter((flag): flag is BoundaryReasonFlag => VALID_BOUNDARY_REASON_FLAGS.has(flag))

  if (validFlags.includes("OTHER")) {
    return ["OTHER" as const]
  }

  return ["PLACE_SHIFT", "TIME_SHIFT", "CAST_SHIFT"].filter((flag) =>
    validFlags.includes(flag as BoundaryReasonFlag),
  ) as BoundaryReasonFlag[]
}

function normalizeStudyCondition(condition: unknown): StudyCondition {
  return typeof condition === "string" && VALID_STUDY_CONDITIONS.has(condition as StudyCondition)
    ? (condition as StudyCondition)
    : "control"
}
