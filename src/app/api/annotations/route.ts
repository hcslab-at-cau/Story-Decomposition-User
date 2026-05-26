import { NextResponse } from "next/server"

import { getAnnotation, listAnnotations, saveAnnotation } from "@/lib/data/fs-store"
import { compactId, uniqueSortedNumbers } from "@/lib/ids"
import type { Annotation, BoundaryReason } from "@/types/annotation"

export const runtime = "nodejs"

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
    annotator_id?: string
    boundary_before_pids?: number[]
    boundary_sentence_ids?: string[]
    boundary_points?: Annotation["boundary_points"]
    boundary_reasons?: Record<string, BoundaryReason>
    notes?: Record<string, string>
  }

  if (!body.doc_id || !body.chapter_id || !body.annotator_id) {
    return NextResponse.json({ error: "doc_id, chapter_id, and annotator_id are required" }, { status: 400 })
  }

  const existing = await getAnnotation(body.doc_id, body.chapter_id, body.annotator_id)
  const now = new Date().toISOString()
  const annotation: Annotation = {
    annotation_id: existing?.annotation_id ?? compactId(`${body.doc_id}_${body.chapter_id}_${body.annotator_id}`),
    doc_id: body.doc_id,
    chapter_id: body.chapter_id,
    annotator_id: body.annotator_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    boundary_before_pids: uniqueSortedNumbers(body.boundary_before_pids ?? []),
    boundary_sentence_ids: body.boundary_sentence_ids ?? [],
    boundary_points: body.boundary_points ?? [],
    boundary_reasons: body.boundary_reasons ?? {},
    notes: body.notes ?? {},
  }

  await saveAnnotation(annotation)
  return NextResponse.json({ annotation })
}
