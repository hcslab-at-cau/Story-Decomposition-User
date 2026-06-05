import { NextResponse } from "next/server"

import { buildConsensusGold } from "@/lib/evaluation/consensus"
import { listAnnotations, listConsensus, saveConsensus } from "@/lib/data/fs-store"
import { isTestParticipantId } from "@/lib/participants"

export const runtime = "nodejs"

export async function GET() {
  const consensus = await listConsensus()
  return NextResponse.json({ consensus })
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    doc_id?: string
    chapter_id?: string
    tolerance?: number
  }

  if (!body.doc_id || !body.chapter_id) {
    return NextResponse.json({ error: "doc_id and chapter_id are required" }, { status: 400 })
  }

  const annotations = (await listAnnotations()).filter(
    (annotation) => !isTestParticipantId(annotation.annotator_id),
  )
  const consensus = buildConsensusGold(body.doc_id, body.chapter_id, annotations, body.tolerance ?? 1)
  await saveConsensus(consensus)

  return NextResponse.json({ consensus })
}
