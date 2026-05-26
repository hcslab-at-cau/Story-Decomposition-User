import { NextResponse } from "next/server"

import {
  listAnnotations,
  listConsensus,
  listPredictions,
  saveResultBundle,
} from "@/lib/data/fs-store"
import { evaluatePredictions } from "@/lib/evaluation/evaluate"

export const runtime = "nodejs"

export async function GET() {
  return runEvaluation()
}

export async function POST() {
  return runEvaluation()
}

async function runEvaluation() {
  const [predictions, consensus, annotations] = await Promise.all([
    listPredictions(),
    listConsensus(),
    listAnnotations(),
  ])
  const bundle = evaluatePredictions(predictions, consensus, annotations)
  await saveResultBundle(bundle)

  return NextResponse.json({ evaluation: bundle })
}
