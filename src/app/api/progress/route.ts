import { NextResponse } from "next/server"

import { listAnnotations, listConsensus, listDocuments, listPredictions } from "@/lib/data/fs-store"

export const runtime = "nodejs"

export async function GET() {
  const [documents, annotations, consensus, predictions] = await Promise.all([
    listDocuments(),
    listAnnotations(),
    listConsensus(),
    listPredictions(),
  ])

  const chapters = documents.flatMap((document) =>
    document.chapters.map((chapter) => {
      const chapterAnnotations = annotations.filter(
        (annotation) => annotation.doc_id === document.doc_id && annotation.chapter_id === chapter.chapter_id,
      )
      const chapterConsensus = consensus.find(
        (item) => item.doc_id === document.doc_id && item.chapter_id === chapter.chapter_id,
      )
      const chapterPredictions = predictions.filter(
        (prediction) => prediction.doc_id === document.doc_id && prediction.chapter_id === chapter.chapter_id,
      )

      return {
        doc_id: document.doc_id,
        document_title: document.title,
        chapter_id: chapter.chapter_id,
        chapter_title: chapter.title,
        paragraph_count: chapter.paragraphs.length,
        annotation_count: chapterAnnotations.length,
        annotators: chapterAnnotations.map((annotation) => ({
          annotator_id: annotation.annotator_id,
          boundary_count: annotation.boundary_before_pids.length,
          updated_at: annotation.updated_at,
        })),
        has_consensus: Boolean(chapterConsensus),
        gold_boundary_count: chapterConsensus?.gold_boundaries.length ?? 0,
        ambiguous_boundary_count: chapterConsensus?.ambiguous_boundaries.length ?? 0,
        prediction_count: chapterPredictions.length,
      }
    }),
  )

  return NextResponse.json({
    summary: {
      document_count: documents.length,
      chapter_count: chapters.length,
      annotation_count: annotations.length,
      consensus_count: consensus.length,
      prediction_count: predictions.length,
    },
    chapters,
  })
}
