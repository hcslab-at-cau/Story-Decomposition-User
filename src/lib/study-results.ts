import { randomUUID } from "node:crypto"

import type { DocumentData, WriteBatch } from "firebase-admin/firestore"

import { explainAdminCredentialError, getAdminDb } from "@/lib/firebase-admin"
import type { Annotation } from "@/types/annotation"
import type {
  ReadingEvent,
  ScaffoldEvent,
  StudyResponse,
  StudySessionMeta,
} from "@/types/study-results"

const DEFAULT_STUDY_ID = process.env.STUDY_ID ?? process.env.NEXT_PUBLIC_STUDY_ID ?? "scene_boundary_annotation_v1"
const STUDY_RESULTS_ROOT = process.env.STUDY_RESULTS_ROOT ?? "studies"
const MAX_BATCH_WRITES = 450

interface StudyPath {
  studyId?: string
  participantId: string
  sessionId: string
}

export function resolveStudyId(studyId?: string) {
  return cleanPathSegment(studyId?.trim() || DEFAULT_STUDY_ID, "studyId")
}

export function isStudyResultsEnabled() {
  const mode = process.env.STUDY_RESULTS_STORE ?? process.env.STUDY_DATA_STORE ?? process.env.DATA_STORE

  if (mode === "false" || mode === "off" || mode === "local" || mode === "filesystem") {
    return false
  }

  if (mode === "true" || mode === "firebase" || mode === "firestore") {
    return true
  }

  return Boolean(process.env.VERCEL)
}

export async function upsertStudySession(meta: StudySessionMeta) {
  return withStudyResultErrorContext(async () => {
    const now = new Date().toISOString()
    const studyId = resolveStudyId(meta.studyId)
    const participantId = cleanPathSegment(meta.participantId, "participantId")
    const sessionId = cleanPathSegment(meta.sessionId, "sessionId")
    const sessionRef = getSessionRef({ studyId, participantId, sessionId })
    const normalizedMeta: StudySessionMeta = {
      ...meta,
      studyId,
      participantId,
      sessionId,
      createdAt: meta.createdAt ?? meta.startTime ?? now,
      updatedAt: now,
    }

    const batch = getAdminDb().batch()
    batch.set(
      getAdminDb().collection(STUDY_RESULTS_ROOT).doc(studyId),
      cleanForFirestore({
        studyId,
        updatedAt: now,
      }) as DocumentData,
      { merge: true },
    )
    batch.set(
      getAdminDb().collection(STUDY_RESULTS_ROOT).doc(studyId).collection("participants").doc(participantId),
      cleanForFirestore({
        participantId,
        updatedAt: now,
      }) as DocumentData,
      { merge: true },
    )
    batch.set(
      sessionRef,
      cleanForFirestore({
        studyId,
        participantId,
        sessionId,
        condition: normalizedMeta.condition,
        bookId: normalizedMeta.bookId,
        chapterId: normalizedMeta.chapterId,
        taskId: normalizedMeta.taskId,
        assignedOrder: normalizedMeta.assignedOrder,
        startTime: normalizedMeta.startTime,
        endTime: normalizedMeta.endTime,
        createdAt: normalizedMeta.createdAt,
        updatedAt: now,
      }) as DocumentData,
      { merge: true },
    )
    batch.set(
      sessionRef.collection("sessionMeta").doc("current"),
      cleanForFirestore(normalizedMeta) as DocumentData,
      { merge: true },
    )
    await batch.commit()
    return normalizedMeta
  })
}

export async function saveReadingEvents(path: StudyPath, events: ReadingEvent[]) {
  return saveEventBatch(path, "readingEvents", events)
}

export async function saveScaffoldEvents(path: StudyPath, events: ScaffoldEvent[]) {
  return saveEventBatch(path, "scaffoldEvents", events)
}

export async function saveTaskResponse(path: StudyPath, response: StudyResponse) {
  return saveResponse(path, "taskResponses", response)
}

export async function saveSurveyResponse(path: StudyPath, response: StudyResponse) {
  return saveResponse(path, "surveyResponses", response)
}

export async function saveAnnotationTaskResponse(params: {
  studyId?: string
  participantId: string
  sessionId: string
  condition: StudySessionMeta["condition"]
  bookId: string
  chapterId: string
  taskId?: string
  assignedOrder?: number
  startTime?: string
  deviceInfo?: StudySessionMeta["deviceInfo"]
  annotation: Annotation
}) {
  const now = new Date().toISOString()
  const studyId = resolveStudyId(params.studyId)
  const startTime = params.startTime ?? params.annotation.created_at ?? now

  await upsertStudySession({
    studyId,
    participantId: params.participantId,
    sessionId: params.sessionId,
    condition: params.condition,
    bookId: params.bookId,
    chapterId: params.chapterId,
    taskId: params.taskId,
    assignedOrder: params.assignedOrder,
    startTime,
    endTime: now,
    deviceInfo: params.deviceInfo,
  })

  return saveTaskResponse(
    {
      studyId,
      participantId: params.participantId,
      sessionId: params.sessionId,
    },
    {
      responseId: `annotation_${params.annotation.annotation_id}`,
      responseType: "scene_boundary_annotation",
      submittedAt: params.annotation.updated_at,
      payload: {
        annotationId: params.annotation.annotation_id,
        docId: params.annotation.doc_id,
        chapterId: params.annotation.chapter_id,
        textId: params.annotation.text_id,
        status: params.annotation.status,
        startedAt: params.annotation.started_at,
        submittedAt: params.annotation.submitted_at,
        durationMs: params.annotation.duration_ms,
        datasetVersion: params.annotation.dataset_version,
        guidelineVersion: params.annotation.guideline_version,
        uiVersion: params.annotation.ui_version,
        paragraphCount: params.annotation.paragraph_count,
        boundaryCount: params.annotation.boundary_count,
        boundaryBeforePids: params.annotation.boundary_before_pids,
        boundaryReasons: params.annotation.boundary_reasons,
        boundaryReasonFlags: params.annotation.boundary_reason_flags,
        notes: params.annotation.notes,
        boundaryPoints: params.annotation.boundary_points ?? [],
      },
    },
  )
}

async function saveEventBatch(
  path: StudyPath,
  collectionName: "readingEvents" | "scaffoldEvents",
  events: Array<ReadingEvent | ScaffoldEvent>,
) {
  if (events.length === 0) return 0

  return withStudyResultErrorContext(async () => {
    const sessionRef = getSessionRef(path)
    let saved = 0

    for (let start = 0; start < events.length; start += MAX_BATCH_WRITES) {
      const batch = getAdminDb().batch()
      const slice = events.slice(start, start + MAX_BATCH_WRITES)

      for (const event of slice) {
        const eventId = cleanPathSegment(event.eventId ?? randomUUID(), "eventId")
        batch.set(
          sessionRef.collection(collectionName).doc(eventId),
          cleanForFirestore({
            ...event,
            eventId,
          }) as DocumentData,
        )
      }

      await commitBatch(batch)
      saved += slice.length
    }

    return saved
  })
}

async function saveResponse(
  path: StudyPath,
  collectionName: "taskResponses" | "surveyResponses",
  response: StudyResponse,
) {
  return withStudyResultErrorContext(async () => {
    const responseId = cleanPathSegment(response.responseId ?? randomUUID(), "responseId")
    const sessionRef = getSessionRef(path)

    await sessionRef.collection(collectionName).doc(responseId).set(
      cleanForFirestore({
        ...response,
        responseId,
      }) as DocumentData,
      { merge: true },
    )

    return {
      ...response,
      responseId,
    }
  })
}

function getSessionRef(path: StudyPath) {
  const studyId = resolveStudyId(path.studyId)
  const participantId = cleanPathSegment(path.participantId, "participantId")
  const sessionId = cleanPathSegment(path.sessionId, "sessionId")

  return getAdminDb()
    .collection(STUDY_RESULTS_ROOT)
    .doc(studyId)
    .collection("participants")
    .doc(participantId)
    .collection("sessions")
    .doc(sessionId)
}

async function commitBatch(batch: WriteBatch) {
  await batch.commit()
}

async function withStudyResultErrorContext<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    throw explainAdminCredentialError(error)
  }
}

function cleanPathSegment(value: string, fieldName: string) {
  const normalized = value.trim()

  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error(`${fieldName} must contain only letters, numbers, underscores, or hyphens.`)
  }

  return normalized
}

function cleanForFirestore(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanForFirestore)
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue !== undefined) {
        output[key] = cleanForFirestore(nestedValue)
      }
    }

    return output
  }

  return value
}
