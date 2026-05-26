import { NextResponse } from "next/server"

import { getDocument, savePrediction } from "@/lib/data/fs-store"
import { fixedSizePrediction } from "@/lib/segmentation/fixed-size"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json()) as {
    doc_id?: string
    chapter_id?: string
    k?: number
  }

  if (!body.doc_id || !body.chapter_id) {
    return NextResponse.json({ error: "doc_id and chapter_id are required" }, { status: 400 })
  }

  const document = await getDocument(body.doc_id)
  const chapter = document?.chapters.find((item) => item.chapter_id === body.chapter_id)

  if (!document || !chapter) {
    return NextResponse.json({ error: "Document or chapter not found" }, { status: 404 })
  }

  const prediction = fixedSizePrediction(document.doc_id, chapter, body.k ?? 5)
  await savePrediction(prediction)

  return NextResponse.json({ prediction })
}
