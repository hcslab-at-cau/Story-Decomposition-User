import type { DocumentData, DocumentReference, QueryDocumentSnapshot } from "firebase-admin/firestore"

import { getAdminDb, explainAdminCredentialError } from "@/lib/firebase-admin"
import { slugifyId } from "@/lib/ids"
import { state3ToPrediction } from "@/lib/segmentation/state3-import"
import type { Chapter, NarrativeDocument, Paragraph } from "@/types/document"
import type { Prediction } from "@/types/prediction"

export type FirebaseDataSource = "current" | "legacy"

export interface FirebaseDocumentSummary {
  doc_id: string
  title: string
  author?: string
  chapter_count?: number
  total_chapter_count?: number
  pre2_chapter_count?: number
  created_at?: string
  source: FirebaseDataSource
}

interface Pre2Unit {
  pid?: number
  content_type?: string
  is_story_text?: boolean
}

interface Pre2Artifact {
  units?: Pre2Unit[]
}

interface LoadedStageArtifact {
  artifact_id?: string
  payload: Record<string, unknown>
  run_id: string
}

const CURRENT_DOCUMENTS_COLLECTION = "documents_v2"
const LEGACY_DOCUMENTS_COLLECTION = "documents"

function collectionName(source: FirebaseDataSource) {
  return source === "legacy" ? LEGACY_DOCUMENTS_COLLECTION : CURRENT_DOCUMENTS_COLLECTION
}

export function parseFirebaseDataSource(value: string | null | undefined): FirebaseDataSource {
  return value === "legacy" ? "legacy" : "current"
}

function documentsCollection(source: FirebaseDataSource) {
  return getAdminDb().collection(collectionName(source))
}

async function withAdminErrorContext<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    throw explainAdminCredentialError(error)
  }
}

export async function listFirebaseDocuments(source: FirebaseDataSource): Promise<FirebaseDocumentSummary[]> {
  return withAdminErrorContext(async () => {
    const snap = await documentsCollection(source).get()
    const summaries = await Promise.all(snap.docs.map((docSnap) => documentSummaryFromSnapshot(docSnap, source)))
    return summaries
      .filter((summary): summary is FirebaseDocumentSummary => Boolean(summary))
      .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""))
  })
}

export async function importFirebaseDocument(
  docId: string,
  source: FirebaseDataSource,
): Promise<NarrativeDocument> {
  return withAdminErrorContext(async () => {
    const docRef = documentsCollection(source).doc(docId)
    const [documentSnap, chaptersSnap] = await Promise.all([docRef.get(), docRef.collection("chapters").get()])

    if (!documentSnap.exists) {
      throw new Error(`Firebase document not found: ${docId}`)
    }

    const documentData = documentSnap.data() ?? {}
    const chapters = (
      await Promise.all(
        chaptersSnap.docs.map(async (chapterSnap, index) => {
          const pre2 = await loadPre2Artifact(chapterSnap.ref)
          return pre2 ? chapterFromSnapshot(chapterSnap, index + 1, pre2) : null
        }),
      )
    )
      .filter((chapter): chapter is Chapter => Boolean(chapter))
      .sort((left, right) => left.chapter_index - right.chapter_index)
      .map((chapter, index) => ({
        ...chapter,
        chapter_index: index + 1,
      }))

    if (chapters.length === 0) {
      throw new Error("No PRE.2-ready chapters were found under this Firebase document.")
    }

    return {
      doc_id: safeLocalDocId(docId),
      title: readString(documentData.title) ?? readString(documentData.name) ?? docId,
      author: readString(documentData.author) ?? readString(documentData.creator),
      source_file: `firebase:${collectionName(source)}/${docId}`,
      created_at: readDate(documentData.createdAt ?? documentData.created_at) ?? new Date().toISOString(),
      chapters,
    }
  })
}

export async function importFirebaseState3Prediction(
  document: NarrativeDocument,
  chapterId: string,
): Promise<Prediction> {
  return withAdminErrorContext(async () => {
    const source = firebaseSourceFromDocument(document)
    const chapterRef = documentsCollection(source.source).doc(source.docId).collection("chapters").doc(chapterId)
    const chapterSnap = await chapterRef.get()

    if (!chapterSnap.exists) {
      throw new Error(`Firebase chapter not found: ${source.docId}/${chapterId}`)
    }

    const state3 = await loadStageArtifact(chapterRef, "state3")

    if (!state3) {
      throw new Error(`No STATE.3 artifact was found for ${document.title}/${chapterId}.`)
    }

    const prediction = state3ToPrediction(document.doc_id, chapterId, state3.payload)

    return {
      ...prediction,
      prediction_id: `state3_${document.doc_id}_${chapterId}_${state3.artifact_id ?? state3.run_id}`,
      params: {
        ...prediction.params,
        source: "Firebase STATE.3",
        firebase_collection: collectionName(source.source),
        firebase_doc_id: source.docId,
        firebase_run_id: state3.run_id,
        firebase_artifact_id: state3.artifact_id,
      },
    }
  })
}

async function documentSummaryFromSnapshot(
  docSnap: QueryDocumentSnapshot<DocumentData>,
  source: FirebaseDataSource,
): Promise<FirebaseDocumentSummary | null> {
  const data = docSnap.data()
  const chaptersSnap = await docSnap.ref.collection("chapters").get()
  const pre2Ready = await Promise.all(chaptersSnap.docs.map((chapterSnap) => hasPre2Artifact(chapterSnap.ref)))
  const pre2ChapterCount = pre2Ready.filter(Boolean).length

  if (pre2ChapterCount === 0) {
    return null
  }

  return {
    doc_id: docSnap.id,
    title: readString(data.title) ?? readString(data.name) ?? docSnap.id,
    author: readString(data.author) ?? readString(data.creator),
    chapter_count: pre2ChapterCount,
    total_chapter_count: chaptersSnap.size || readNumber(data.chapterCount ?? data.chapter_count),
    pre2_chapter_count: pre2ChapterCount,
    created_at: readDate(data.createdAt ?? data.created_at),
    source,
  }
}

function chapterFromSnapshot(
  chapterSnap: QueryDocumentSnapshot<DocumentData>,
  fallbackIndex: number,
  pre2?: Pre2Artifact,
): Chapter | null {
  const data = chapterSnap.data()
  const raw = readObject(data.raw) ?? readObject(data.raw_chapter) ?? readObject(data.rawChapter) ?? data
  const paragraphs = paragraphsFromRaw(raw, pre2)

  if (paragraphs.length === 0) return null

  const index =
    readNumber(data.index ?? data.chapter_index ?? data.chapterIndex ?? raw.chapter_index) ??
    parseInt(chapterSnap.id.replace(/\D/g, "") || String(fallbackIndex), 10)

  return {
    chapter_id: readString(raw.chapter_id) ?? readString(data.chapter_id) ?? chapterSnap.id,
    chapter_index: index,
    title: titleFromRawParagraphs(raw) ?? readableTitle(raw, data) ?? `Chapter ${index}`,
    paragraphs,
  }
}

function paragraphsFromRaw(raw: Record<string, unknown>, pre2?: Pre2Artifact): Paragraph[] {
  const paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs : null
  const unitsByPid = new Map(
    (pre2?.units ?? [])
      .filter((unit): unit is Pre2Unit & { pid: number } => typeof unit.pid === "number")
      .map((unit) => [unit.pid, unit] as const),
  )

  if (paragraphs) {
    const parsed = paragraphs
      .map((paragraph, index) => paragraphFromUnknown(paragraph, index + 1))
      .filter((paragraph): paragraph is Paragraph => Boolean(paragraph))

    return applyPre2StoryFilter(parsed, unitsByPid)
  }

  const text = readString(raw.text)
  if (!text) return []

  const parsed = text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      pid: index + 1,
      text: paragraph,
    }))

  return applyPre2StoryFilter(parsed, unitsByPid)
}

function paragraphFromUnknown(value: unknown, fallbackPid: number): Paragraph | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const text = readString(raw.text ?? raw.body ?? raw.content)
  if (!text) return null

  return {
    pid: readNumber(raw.pid ?? raw.id) ?? fallbackPid,
    text: text.replace(/\s+/g, " ").trim(),
    is_narrative: readBoolean(raw.is_narrative ?? raw.isStoryText),
  }
}

async function hasPre2Artifact(chapterRef: DocumentReference<DocumentData>) {
  return Boolean(await loadPre2Artifact(chapterRef))
}

async function loadPre2Artifact(chapterRef: DocumentReference<DocumentData>): Promise<Pre2Artifact | null> {
  const artifact = await loadStageArtifact(chapterRef, "pre2")
  return artifact ? parsePre2Artifact(artifact.payload) : null
}

async function loadStageArtifact(
  chapterRef: DocumentReference<DocumentData>,
  stageKey: string,
): Promise<LoadedStageArtifact | null> {
  const runsSnap = await chapterRef.collection("runs").get()
  const runs = runsSnap.docs.sort((left, right) => {
    const leftData = left.data()
    const rightData = right.data()
    if (leftData.favorite && !rightData.favorite) return -1
    if (!leftData.favorite && rightData.favorite) return 1
    return right.id.localeCompare(left.id)
  })

  for (const runSnap of runs) {
    const runData = runSnap.data()
    const stageRefs = readObject(runData.stageRefs)
    const sharedArtifactId = readString(stageRefs?.[stageKey])

    if (sharedArtifactId) {
      const artifactSnap = await chapterRef.collection("artifacts").doc(sharedArtifactId).get()
      const payload = readObject(artifactPayloadFromDoc(artifactSnap.data()))
      if (payload) {
        return {
          artifact_id: sharedArtifactId,
          payload,
          run_id: runSnap.id,
        }
      }
    }

    const runArtifactSnap = await runSnap.ref.collection("artifacts").doc(stageKey).get()
    const runArtifact = readObject(artifactPayloadFromDoc(runArtifactSnap.data()))
    if (runArtifact) {
      return {
        artifact_id: stageKey,
        payload: runArtifact,
        run_id: runSnap.id,
      }
    }

    const inlineArtifact = readObject(runData[stageKey])
    if (inlineArtifact) {
      return {
        payload: inlineArtifact,
        run_id: runSnap.id,
      }
    }
  }

  return null
}

function artifactPayloadFromDoc(data: DocumentData | undefined): unknown {
  if (!data) return null
  return data.payload ?? data
}

function parsePre2Artifact(value: unknown): Pre2Artifact | null {
  const artifact = readObject(value)
  const units = Array.isArray(artifact?.units) ? artifact.units : null
  if (!units) return null

  const parsedUnits: Pre2Unit[] = []
  for (const unit of units) {
    const raw = readObject(unit)
    if (!raw) continue
    parsedUnits.push({
      pid: readNumber(raw.pid),
      content_type: readString(raw.content_type),
      is_story_text: readBoolean(raw.is_story_text),
    })
  }

  return {
    units: parsedUnits,
  }
}

function applyPre2StoryFilter(paragraphs: Paragraph[], unitsByPid: Map<number, Pre2Unit>): Paragraph[] {
  if (unitsByPid.size === 0) return paragraphs

  return paragraphs
    .map((paragraph) => ({
      ...paragraph,
      is_narrative: unitsByPid.get(paragraph.pid)?.is_story_text ?? paragraph.is_narrative,
    }))
    .filter((paragraph) => unitsByPid.get(paragraph.pid)?.is_story_text === true)
}

function titleFromRawParagraphs(raw: Record<string, unknown>) {
  const paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs : []

  for (const paragraph of paragraphs.slice(0, 4)) {
    const text =
      typeof paragraph === "string"
        ? paragraph
        : readString(readObject(paragraph)?.text ?? readObject(paragraph)?.body ?? readObject(paragraph)?.content)
    const title = titleFromHeadingText(text)
    if (title) return title
  }

  return undefined
}

function titleFromHeadingText(text: string | undefined) {
  if (!text) return undefined
  const normalized = text.replace(/\s+/g, " ").trim()
  const chapterMatch = normalized.match(/^chapter\s+(?:[ivxlcdm]+|\d+)\.?\s*(.+)$/i)
  return chapterMatch?.[1]?.trim() || undefined
}

function readableTitle(raw: Record<string, unknown>, data: DocumentData) {
  const title = readString(raw.title) ?? readString(data.title)
  if (!title || /^item\d+$/i.test(title)) return undefined
  return title
}

function safeLocalDocId(docId: string) {
  return /^[a-zA-Z0-9_-]+$/.test(docId) ? docId : slugifyId(docId, "firebase-document")
}

function firebaseSourceFromDocument(document: NarrativeDocument): { source: FirebaseDataSource; docId: string } {
  const match = document.source_file?.match(/^firebase:(documents_v2|documents)\/([^/]+)$/)

  if (!match) {
    throw new Error(`${document.title} was not imported from Firebase.`)
  }

  return {
    source: match[1] === LEGACY_DOCUMENTS_COLLECTION ? "legacy" : "current",
    docId: match[2],
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function readDate(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === "string") return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString()
  }
  return undefined
}
