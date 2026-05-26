import { NextResponse } from "next/server"

import { savePrediction } from "@/lib/data/fs-store"
import { state3ToPrediction } from "@/lib/segmentation/state3-import"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json()) as {
    doc_id?: string
    chapter_id?: string
    state3?: unknown
  }

  if (!body.doc_id || !body.chapter_id || !body.state3) {
    return NextResponse.json({ error: "doc_id, chapter_id, and state3 are required" }, { status: 400 })
  }

  const prediction = state3ToPrediction(body.doc_id, body.chapter_id, body.state3)
  await savePrediction(prediction)

  return NextResponse.json({ prediction })
}
