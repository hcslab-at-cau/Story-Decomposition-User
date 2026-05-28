import { NextResponse } from "next/server"

import { listAnnotations, listDocuments } from "@/lib/data/fs-store"
import { buildDatasetTaskSummaries } from "@/lib/study-dataset"
import type { Annotation, BoundaryReason, BoundaryReasonFlag } from "@/types/annotation"
import type { Chapter, DatasetTaskSummary, NarrativeDocument } from "@/types/document"

export const runtime = "nodejs"

const reasonFlagByReason: Record<BoundaryReason, BoundaryReasonFlag> = {
  place_change: "PLACE_SHIFT",
  time_change: "TIME_SHIFT",
  cast_change: "CAST_SHIFT",
  other: "OTHER",
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const type = url.searchParams.get("type") === "submissions" ? "submissions" : "boundaries"
  const [annotations, documents] = await Promise.all([listAnnotations(), listDocuments()])
  const tasks = buildDatasetTaskSummaries(documents)
  const taskByChapter = new Map(tasks.map((task) => [chapterKey(task.doc_id, task.chapter_id), task] as const))
  const documentById = new Map(documents.map((document) => [document.doc_id, document] as const))
  const studyAnnotations = annotations.filter((annotation) =>
    taskByChapter.has(chapterKey(annotation.doc_id, annotation.chapter_id)),
  )
  const csv =
    type === "submissions"
      ? submissionsCsv(studyAnnotations, documentById, taskByChapter)
      : boundariesCsv(studyAnnotations, documentById, taskByChapter)

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="annotations_${type}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}

function submissionsCsv(
  annotations: Annotation[],
  documentById: Map<string, NarrativeDocument>,
  taskByChapter: Map<string, DatasetTaskSummary>,
) {
  const rows = [
    [
      "submission_id",
      "annotation_id",
      "status",
      "participant_id",
      "doc_id",
      "chapter_id",
      "text_id",
      "document_title",
      "chapter_title",
      "dataset_version",
      "guideline_version",
      "ui_version",
      "created_at",
      "started_at",
      "submitted_at",
      "updated_at",
      "duration_ms",
      "paragraph_count",
      "boundary_count",
      "boundary_before_pids",
    ],
    ...annotations.map((annotation) => {
      const task = findTask(taskByChapter, annotation)
      const chapter = findChapter(documentById, annotation)

      return [
        submissionId(annotation, task),
        annotation.annotation_id,
        annotation.status ?? "",
        annotation.annotator_id,
        annotation.doc_id,
        annotation.chapter_id,
        resolvedTextId(annotation, task),
        documentTitle(annotation, task, documentById),
        chapterTitle(task, chapter),
        annotation.dataset_version ?? "",
        annotation.guideline_version ?? "",
        annotation.ui_version ?? "",
        annotation.created_at,
        annotation.started_at ?? "",
        annotation.submitted_at ?? "",
        annotation.updated_at,
        String(annotation.duration_ms ?? ""),
        String(annotation.paragraph_count ?? chapter?.paragraphs.length ?? ""),
        String(annotation.boundary_count ?? annotation.boundary_before_pids.length),
        annotation.boundary_before_pids.join("|"),
      ]
    }),
  ]

  return toCsv(rows)
}

function boundariesCsv(
  annotations: Annotation[],
  documentById: Map<string, NarrativeDocument>,
  taskByChapter: Map<string, DatasetTaskSummary>,
) {
  const rows: string[][] = [
    [
      "submission_id",
      "annotation_id",
      "status",
      "participant_id",
      "doc_id",
      "chapter_id",
      "text_id",
      "document_title",
      "chapter_title",
      "dataset_version",
      "guideline_version",
      "ui_version",
      "boundary_index",
      "boundary_before_pid",
      "start_para_order",
      "prev_para_id",
      "start_para_id",
      "gap_id",
      "reason_flags",
      "reason_place",
      "reason_time",
      "reason_cast",
      "reason_other",
      "note",
      "paragraph_text",
      "created_at",
      "updated_at",
      "submitted_at",
    ],
  ]

  for (const annotation of annotations) {
    const task = findTask(taskByChapter, annotation)
    const chapter = findChapter(documentById, annotation)
    const paragraphByPid = new Map(chapter?.paragraphs.map((paragraph) => [paragraph.pid, paragraph] as const) ?? [])
    const pointByPid = new Map(
      (annotation.boundary_points ?? []).map((point) => [point.boundary_before_pid ?? point.pid, point] as const),
    )

    annotation.boundary_before_pids.forEach((pid, index) => {
      const key = String(pid)
      const point = pointByPid.get(pid)
      const paragraph = paragraphByPid.get(pid)
      const order = point?.start_para_order ?? point?.paragraph_index ?? paragraphOrder(chapter, pid)
      const reasons = normalizeReasons(annotation.boundary_reasons[key])
      const reasonFlags =
        point?.reason_flags ??
        annotation.boundary_reason_flags?.[key] ??
        reasons.map((reason) => reasonFlagByReason[reason])
      const textId = resolvedTextId(annotation, task)
      const startParaId = point?.start_para_id ?? paragraphId(textId, pid)
      const prevParaId = point?.prev_para_id ?? previousParagraphId(textId, chapter, order)
      const gapId = point?.gap_id ?? (prevParaId ? `${prevParaId}__${startParaId}` : "")

      rows.push([
        submissionId(annotation, task),
        annotation.annotation_id,
        annotation.status ?? "",
        annotation.annotator_id,
        annotation.doc_id,
        annotation.chapter_id,
        textId,
        documentTitle(annotation, task, documentById),
        chapterTitle(task, chapter),
        annotation.dataset_version ?? "",
        annotation.guideline_version ?? "",
        annotation.ui_version ?? "",
        String(index + 1),
        String(pid),
        String(order ?? ""),
        prevParaId ?? "",
        startParaId,
        gapId,
        reasonFlags.join("|"),
        hasReasonFlag(reasonFlags, "PLACE_SHIFT"),
        hasReasonFlag(reasonFlags, "TIME_SHIFT"),
        hasReasonFlag(reasonFlags, "CAST_SHIFT"),
        hasReasonFlag(reasonFlags, "OTHER"),
        annotation.notes[key] ?? "",
        point?.paragraph_text ?? paragraph?.text ?? "",
        annotation.created_at,
        annotation.updated_at,
        annotation.submitted_at ?? "",
      ])
    })
  }

  return toCsv(rows)
}

function findTask(taskByChapter: Map<string, DatasetTaskSummary>, annotation: Annotation) {
  return taskByChapter.get(chapterKey(annotation.doc_id, annotation.chapter_id)) ?? null
}

function findChapter(documentById: Map<string, NarrativeDocument>, annotation: Annotation): Chapter | null {
  return (
    documentById
      .get(annotation.doc_id)
      ?.chapters.find((chapter) => chapter.chapter_id === annotation.chapter_id) ?? null
  )
}

function paragraphOrder(chapter: Chapter | null, pid: number) {
  const index = chapter?.paragraphs.findIndex((paragraph) => paragraph.pid === pid) ?? -1
  return index >= 0 ? index + 1 : undefined
}

function previousParagraphId(textId: string, chapter: Chapter | null, order?: number) {
  if (!chapter || order === undefined || order <= 1) return undefined
  const previous = chapter.paragraphs[order - 2]

  return previous ? paragraphId(textId, previous.pid) : undefined
}

function paragraphId(textId: string, pid: number) {
  return `${textId}_P${String(pid).padStart(3, "0")}`
}

function fallbackTextId(annotation: Annotation) {
  return `${annotation.doc_id}_${annotation.chapter_id}`
}

function resolvedTextId(annotation: Annotation, task: DatasetTaskSummary | null) {
  return annotation.text_id ?? task?.task_id ?? fallbackTextId(annotation)
}

function documentTitle(
  annotation: Annotation,
  task: DatasetTaskSummary | null,
  documentById: Map<string, NarrativeDocument>,
) {
  return task?.document_title ?? documentById.get(annotation.doc_id)?.title ?? annotation.doc_id
}

function chapterTitle(task: DatasetTaskSummary | null, chapter: Chapter | null) {
  return task?.label ?? chapter?.title ?? ""
}

function submissionId(annotation: Annotation, task: DatasetTaskSummary | null) {
  return `${annotation.annotator_id}__${resolvedTextId(annotation, task)}`
}

function normalizeReasons(value: unknown): BoundaryReason[] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : []
  const values = rawValues
    .map((item) => String(item))
    .map((item) => {
      if (item === "place" || item === "place_change") return "place_change"
      if (item === "time" || item === "time_change") return "time_change"
      if (item === "cast" || item === "cast_change") return "cast_change"
      if (item === "other") return "other"
      return null
    })
    .filter((item): item is BoundaryReason => Boolean(item))

  const deduped = Array.from(new Set(values))
  return deduped.includes("other")
    ? ["other"]
    : (["place_change", "time_change", "cast_change"].filter((reason) =>
        deduped.includes(reason as BoundaryReason),
      ) as BoundaryReason[])
}

function hasReasonFlag(reasonFlags: BoundaryReasonFlag[], flag: BoundaryReasonFlag) {
  return reasonFlags.includes(flag) ? "1" : "0"
}

function chapterKey(docId: string, chapterId: string) {
  return `${docId}::${chapterId}`
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
}

function csvCell(value: string) {
  if (!/[",\n]/.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '""')}"`
}
