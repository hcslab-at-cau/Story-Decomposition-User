import { NextResponse } from "next/server"

import { getConsensus, getDocument } from "@/lib/data/fs-store"

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
  const payload = {
    schema: "scene_boundary_gold.v1",
    doc_id: docId,
    document_title: document?.title ?? docId,
    chapter_id: chapterId,
    chapter_title: chapter?.title ?? chapterId,
    paragraph_count: chapter?.paragraphs.length ?? null,
    annotator_count: consensus.annotator_count,
    tolerance_for_clustering: consensus.tolerance_for_clustering,
    boundary_before_pids: consensus.gold_boundaries.map((boundary) => boundary.boundary_before_pid),
    gold_boundaries: consensus.gold_boundaries,
    ambiguous_boundaries: consensus.ambiguous_boundaries,
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
