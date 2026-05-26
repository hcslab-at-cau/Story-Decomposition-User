import { NextResponse } from "next/server"

import { getDocument, savePrediction } from "@/lib/data/fs-store"
import { importFirebaseState3Prediction } from "@/lib/firebase-documents"
import { state3ToPrediction } from "@/lib/segmentation/state3-import"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json()) as {
    doc_id?: string
    chapter_id?: string
    state3?: unknown
  }

  if (!body.doc_id || !body.chapter_id) {
    return NextResponse.json({ error: "doc_id and chapter_id are required" }, { status: 400 })
  }

  const document = await getDocument(body.doc_id)

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  const prediction = body.state3
    ? state3ToPrediction(body.doc_id, body.chapter_id, body.state3)
    : await importFirebaseState3Prediction(document, body.chapter_id)
  await savePrediction(prediction)

  return NextResponse.json({ prediction })
}
