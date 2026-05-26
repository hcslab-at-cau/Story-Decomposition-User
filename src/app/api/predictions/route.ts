import { NextResponse } from "next/server"

import { listPredictions } from "@/lib/data/fs-store"

export const runtime = "nodejs"

export async function GET() {
  const predictions = await listPredictions()
  return NextResponse.json({ predictions })
}
