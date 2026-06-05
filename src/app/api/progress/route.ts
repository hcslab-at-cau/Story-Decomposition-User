import { NextResponse } from "next/server"

import { readStudyUsers } from "@/lib/auth/users"
import { listAnnotations, listConsensus, listDocuments, listPredictions } from "@/lib/data/fs-store"
import { isTestParticipantId, studyParticipantIds } from "@/lib/participants"
import { buildDatasetTaskSummaries } from "@/lib/study-dataset"

export const runtime = "nodejs"

export async function GET() {
  const [documents, annotations, consensus, predictions, users] = await Promise.all([
    listDocuments(),
    listAnnotations(),
    listConsensus(),
    listPredictions(),
    readStudyUsers().catch(() => []),
  ])
  const targetTasks = buildDatasetTaskSummaries(documents)
  const targetKeys = new Set(targetTasks.map((task) => chapterKey(task.doc_id, task.chapter_id)))
  const targetDocIds = new Set(targetTasks.map((task) => task.doc_id))
  const targetAnnotations = annotations.filter((annotation) =>
    targetKeys.has(chapterKey(annotation.doc_id, annotation.chapter_id)),
  )
  const targetConsensus = consensus.filter((item) => targetKeys.has(chapterKey(item.doc_id, item.chapter_id)))
  const targetPredictions = predictions.filter((prediction) =>
    targetKeys.has(chapterKey(prediction.doc_id, prediction.chapter_id)),
  )
  const reportAnnotations = targetAnnotations.filter(
    (annotation) => !isTestParticipantId(annotation.annotator_id),
  )
  const registeredParticipantIds = studyParticipantIds(users)

  const participantMap = new Map<string, { id: string; display_name: string }>()

  users
    .filter((user) => user.role === "user")
    .forEach((user) => {
      participantMap.set(user.id, {
        id: user.id,
        display_name: user.display_name,
      })
    })

  targetAnnotations.forEach((annotation) => {
    if (!participantMap.has(annotation.annotator_id)) {
      participantMap.set(annotation.annotator_id, {
        id: annotation.annotator_id,
        display_name: annotation.annotator_id,
      })
    }
  })

  const participants = Array.from(participantMap.values())
    .map((participant) => {
      const participantAnnotations = targetAnnotations.filter(
        (annotation) => annotation.annotator_id === participant.id,
      )
      const lastUpdated = participantAnnotations.reduce<string | null>((latest, annotation) => {
        if (!latest || annotation.updated_at > latest) {
          return annotation.updated_at
        }
        return latest
      }, null)

      return {
        ...participant,
        annotation_count: participantAnnotations.length,
        boundary_count: participantAnnotations.reduce(
          (total, annotation) => total + annotation.boundary_before_pids.length,
          0,
        ),
        last_updated: lastUpdated,
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))

  const chapters = targetTasks.map((task) => {
    const chapterAnnotations = targetAnnotations.filter(
      (annotation) => annotation.doc_id === task.doc_id && annotation.chapter_id === task.chapter_id,
    )
    const chapterConsensus = targetConsensus.find(
      (item) => item.doc_id === task.doc_id && item.chapter_id === task.chapter_id,
    )
    const chapterPredictions = targetPredictions.filter(
      (prediction) => prediction.doc_id === task.doc_id && prediction.chapter_id === task.chapter_id,
    )

    return {
      doc_id: task.doc_id,
      document_title: task.document_title,
      chapter_id: task.chapter_id,
      chapter_title: task.chapter_title,
      paragraph_count: task.paragraph_count,
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
  })

  return NextResponse.json({
    summary: {
      document_count: targetDocIds.size,
      chapter_count: chapters.length,
      annotation_count: reportAnnotations.length,
      consensus_count: targetConsensus.length,
      prediction_count: targetPredictions.length,
    },
    registered_participant_ids: registeredParticipantIds,
    participants,
    chapters,
  })
}

function chapterKey(docId: string, chapterId: string) {
  return `${docId}::${chapterId}`
}
