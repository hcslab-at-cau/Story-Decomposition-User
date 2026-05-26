import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import type { DocumentData, Query } from "firebase-admin/firestore"

import { explainAdminCredentialError, getAdminDb } from "@/lib/firebase-admin"
import type { Annotation, ConsensusGold } from "@/types/annotation"
import type { NarrativeDocument } from "@/types/document"
import type { EvaluationBundle } from "@/types/evaluation"
import type { Prediction } from "@/types/prediction"

const PROJECT_ROOT = process.env.INIT_CWD ?? process.cwd()
const FIRESTORE_PREFIX = process.env.STUDY_FIRESTORE_PREFIX ?? "scene_chunking_eval"

export const DATA_ROOT = path.join(PROJECT_ROOT, "data")

const DIRECTORIES = {
  documents: path.join(DATA_ROOT, "documents"),
  annotations: path.join(DATA_ROOT, "annotations"),
  consensus: path.join(DATA_ROOT, "consensus"),
  predictions: path.join(DATA_ROOT, "predictions"),
  results: path.join(DATA_ROOT, "results"),
  uploads: path.join(DATA_ROOT, "uploads"),
}

const RESULT_EXPORT_NAMES = {
  evaluation: "evaluation.json",
  methodSummary: "method_summary.csv",
  chapterMetrics: "chapter_metrics.csv",
  humanAgreement: "human_agreement.csv",
  goldConfidenceSummary: "gold_confidence_summary.csv",
  errorCases: "error_cases.json",
  paperTables: "paper_tables.md",
}

type StoreMode = "filesystem" | "firestore"

export async function ensureDataDirs() {
  if (dataStoreMode() === "firestore") return
  await Promise.all(Object.values(DIRECTORIES).map((directory) => mkdir(directory, { recursive: true })))
}

export function isFirestoreDataStore() {
  return dataStoreMode() === "firestore"
}

export function documentPath(docId: string) {
  return path.join(DIRECTORIES.documents, `${docId}.json`)
}

export function annotationPath(docId: string, chapterId: string, annotatorId: string) {
  return path.join(DIRECTORIES.annotations, `${docId}__${chapterId}__${annotatorId}.json`)
}

export function consensusPath(docId: string, chapterId: string) {
  return path.join(DIRECTORIES.consensus, `${docId}__${chapterId}.json`)
}

export function predictionPath(predictionId: string) {
  return path.join(DIRECTORIES.predictions, `${predictionId}.json`)
}

export function resultPath(name: string) {
  return path.join(DIRECTORIES.results, name)
}

export function uploadPath(fileName: string) {
  return path.join(DIRECTORIES.uploads, fileName)
}

export async function listDocuments() {
  if (dataStoreMode() === "firestore") {
    return listFirestoreDocuments<NarrativeDocument>("documents")
  }

  return listJsonFiles<NarrativeDocument>(DIRECTORIES.documents)
}

export async function getDocument(docId: string) {
  if (dataStoreMode() === "firestore") {
    return getFirestoreDocument<NarrativeDocument>("documents", docId)
  }

  return readJsonFile<NarrativeDocument>(documentPath(docId))
}

export async function saveDocument(document: NarrativeDocument) {
  if (dataStoreMode() === "firestore") {
    await setFirestoreDocument("documents", document.doc_id, document)
    return
  }

  await writeJsonFile(documentPath(document.doc_id), document)
}

export async function deleteDocumentBundle(docId: string) {
  if (dataStoreMode() === "firestore") {
    return deleteFirestoreDocumentBundle(docId)
  }

  const document = await getDocument(docId)

  if (!document) {
    return null
  }

  const deletedDocument = await deleteFileIfExists(documentPath(docId))
  const annotations = await deleteJsonFilesWithPrefix(DIRECTORIES.annotations, `${docId}__`)
  const consensus = await deleteJsonFilesWithPrefix(DIRECTORIES.consensus, `${docId}__`)
  const predictions = await deletePredictionsForDocument(docId)
  const results = await deleteGeneratedResults()

  return {
    deletedDocument,
    annotations,
    consensus,
    predictions,
    results,
  }
}

export async function listAnnotations() {
  if (dataStoreMode() === "firestore") {
    return listFirestoreDocuments<Annotation>("annotations")
  }

  return listJsonFiles<Annotation>(DIRECTORIES.annotations)
}

export async function getAnnotation(docId: string, chapterId: string, annotatorId: string) {
  if (dataStoreMode() === "firestore") {
    return getFirestoreDocument<Annotation>("annotations", annotationDocumentId(docId, chapterId, annotatorId))
  }

  return readJsonFile<Annotation>(annotationPath(docId, chapterId, annotatorId))
}

export async function saveAnnotation(annotation: Annotation) {
  if (dataStoreMode() === "firestore") {
    await setFirestoreDocument(
      "annotations",
      annotationDocumentId(annotation.doc_id, annotation.chapter_id, annotation.annotator_id),
      annotation,
    )
    return
  }

  await writeJsonFile(
    annotationPath(annotation.doc_id, annotation.chapter_id, annotation.annotator_id),
    annotation,
  )
}

export async function listConsensus() {
  if (dataStoreMode() === "firestore") {
    return listFirestoreDocuments<ConsensusGold>("consensus")
  }

  return listJsonFiles<ConsensusGold>(DIRECTORIES.consensus)
}

export async function getConsensus(docId: string, chapterId: string) {
  if (dataStoreMode() === "firestore") {
    return getFirestoreDocument<ConsensusGold>("consensus", consensusDocumentId(docId, chapterId))
  }

  return readJsonFile<ConsensusGold>(consensusPath(docId, chapterId))
}

export async function saveConsensus(consensus: ConsensusGold) {
  if (dataStoreMode() === "firestore") {
    await setFirestoreDocument("consensus", consensusDocumentId(consensus.doc_id, consensus.chapter_id), consensus)
    return
  }

  await writeJsonFile(consensusPath(consensus.doc_id, consensus.chapter_id), consensus)
}

export async function listPredictions() {
  if (dataStoreMode() === "firestore") {
    return listFirestoreDocuments<Prediction>("predictions")
  }

  return listJsonFiles<Prediction>(DIRECTORIES.predictions)
}

export async function savePrediction(prediction: Prediction) {
  if (dataStoreMode() === "firestore") {
    await setFirestoreDocument("predictions", prediction.prediction_id, prediction)
    return
  }

  await writeJsonFile(predictionPath(prediction.prediction_id), prediction)
}

export async function saveResultBundle(bundle: EvaluationBundle) {
  if (dataStoreMode() === "firestore") {
    await setFirestoreDocument("results", "latest", {
      result_id: "latest",
      ...bundle,
      exports: resultExports(bundle),
    })
    return
  }

  await ensureDataDirs()
  await Promise.all([
    writeJsonFile(resultPath(RESULT_EXPORT_NAMES.evaluation), bundle),
    writeFile(resultPath(RESULT_EXPORT_NAMES.methodSummary), methodSummaryCsv(bundle), "utf8"),
    writeFile(resultPath(RESULT_EXPORT_NAMES.chapterMetrics), methodSummaryCsv(bundle), "utf8"),
    writeFile(resultPath(RESULT_EXPORT_NAMES.humanAgreement), humanAgreementCsv(bundle), "utf8"),
    writeFile(resultPath(RESULT_EXPORT_NAMES.goldConfidenceSummary), goldConfidenceCsv(bundle), "utf8"),
    writeJsonFile(resultPath(RESULT_EXPORT_NAMES.errorCases), errorCases(bundle)),
    writeFile(resultPath(RESULT_EXPORT_NAMES.paperTables), paperTablesMarkdown(bundle), "utf8"),
  ])
}

function dataStoreMode(): StoreMode {
  const mode = process.env.STUDY_DATA_STORE ?? process.env.DATA_STORE

  if (mode === "local" || mode === "filesystem") return "filesystem"
  if (mode === "firebase" || mode === "firestore") return "firestore"
  if (process.env.VERCEL) return "firestore"

  return "filesystem"
}

function collectionName(name: string) {
  return `${FIRESTORE_PREFIX}_${name}`
}

function collection(name: string) {
  return getAdminDb().collection(collectionName(name))
}

async function withFirestoreErrorContext<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    throw explainAdminCredentialError(error)
  }
}

async function listFirestoreDocuments<T>(name: string): Promise<T[]> {
  return withFirestoreErrorContext(async () => {
    const snap = await collection(name).get()
    return snap.docs.map((doc) => doc.data() as T)
  })
}

async function getFirestoreDocument<T>(name: string, id: string): Promise<T | null> {
  return withFirestoreErrorContext(async () => {
    const snap = await collection(name).doc(id).get()
    return snap.exists ? (snap.data() as T) : null
  })
}

async function setFirestoreDocument(name: string, id: string, value: unknown) {
  return withFirestoreErrorContext(async () => {
    await collection(name).doc(id).set(cleanForFirestore(value) as DocumentData)
  })
}

async function deleteFirestoreDocumentBundle(docId: string) {
  return withFirestoreErrorContext(async () => {
    const documentSnap = await collection("documents").doc(docId).get()

    if (!documentSnap.exists) {
      return null
    }

    await collection("documents").doc(docId).delete()
    const [annotations, consensus, predictions, results] = await Promise.all([
      deleteFirestoreQuery(collection("annotations").where("doc_id", "==", docId)),
      deleteFirestoreQuery(collection("consensus").where("doc_id", "==", docId)),
      deleteFirestoreQuery(collection("predictions").where("doc_id", "==", docId)),
      deleteFirestoreQuery(collection("results")),
    ])

    return {
      deletedDocument: 1,
      annotations,
      consensus,
      predictions,
      results,
    }
  })
}

async function deleteFirestoreQuery(query: Query<DocumentData>) {
  const snap = await query.get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
  return snap.size
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await ensureDataDirs()
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function listJsonFiles<T>(directory: string): Promise<T[]> {
  await ensureDataDirs()
  const names = await readdir(directory)
  const jsonNames = names.filter((name) => name.endsWith(".json")).sort()
  const values: T[] = []

  for (const name of jsonNames) {
    const value = await readJsonFile<T>(path.join(directory, name))
    if (value !== null) {
      values.push(value)
    }
  }

  return values
}

async function deleteFileIfExists(filePath: string) {
  try {
    await unlink(filePath)
    return 1
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0
    }
    throw error
  }
}

async function deleteJsonFilesWithPrefix(directory: string, prefix: string) {
  await ensureDataDirs()
  const names = await readdir(directory)
  const targets = names.filter((name) => name.endsWith(".json") && name.startsWith(prefix))
  await Promise.all(targets.map((name) => unlink(path.join(directory, name))))
  return targets.length
}

async function deletePredictionsForDocument(docId: string) {
  await ensureDataDirs()
  const names = await readdir(DIRECTORIES.predictions)
  let deleted = 0

  for (const name of names.filter((fileName) => fileName.endsWith(".json"))) {
    const filePath = path.join(DIRECTORIES.predictions, name)
    const prediction = await readJsonFile<Prediction>(filePath)

    if (prediction?.doc_id === docId) {
      await unlink(filePath)
      deleted += 1
    }
  }

  return deleted
}

async function deleteGeneratedResults() {
  await ensureDataDirs()
  const names = await readdir(DIRECTORIES.results)
  const targets = names.filter((name) => name.endsWith(".json") || name.endsWith(".csv") || name.endsWith(".md"))
  await Promise.all(targets.map((name) => unlink(path.join(DIRECTORIES.results, name))))
  return targets.length
}

function annotationDocumentId(docId: string, chapterId: string, annotatorId: string) {
  return `${docId}__${chapterId}__${annotatorId}`
}

function consensusDocumentId(docId: string, chapterId: string) {
  return `${docId}__${chapterId}`
}

function resultExports(bundle: EvaluationBundle) {
  return {
    [RESULT_EXPORT_NAMES.evaluation]: JSON.stringify(bundle, null, 2),
    [RESULT_EXPORT_NAMES.methodSummary]: methodSummaryCsv(bundle),
    [RESULT_EXPORT_NAMES.chapterMetrics]: methodSummaryCsv(bundle),
    [RESULT_EXPORT_NAMES.humanAgreement]: humanAgreementCsv(bundle),
    [RESULT_EXPORT_NAMES.goldConfidenceSummary]: goldConfidenceCsv(bundle),
    [RESULT_EXPORT_NAMES.errorCases]: JSON.stringify(errorCases(bundle), null, 2),
    [RESULT_EXPORT_NAMES.paperTables]: paperTablesMarkdown(bundle),
  }
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value: number | null) {
  return value === null ? "" : value.toFixed(3)
}

function methodSummaryCsv(bundle: EvaluationBundle) {
  const rows = [
    [
      "method",
      "label",
      "doc_id",
      "chapter_id",
      "exact_f1",
      "tolerance_1_precision",
      "tolerance_1_recall",
      "tolerance_1_f1",
      "scene_count_error",
      "mean_boundary_distance",
    ],
    ...bundle.method_results.map((result) => [
      result.method,
      result.label,
      result.doc_id,
      result.chapter_id,
      result.exact.f1.toFixed(4),
      result.tolerance_1.precision.toFixed(4),
      result.tolerance_1.recall.toFixed(4),
      result.tolerance_1.f1.toFixed(4),
      String(result.scene_count_error),
      formatNumber(result.mean_pred_to_gold_distance),
    ]),
  ]

  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
}

function humanAgreementCsv(bundle: EvaluationBundle) {
  const rows = [
    ["doc_id", "chapter_id", "annotator_a", "annotator_b", "exact_f1", "tolerance_1_f1"],
    ...bundle.human_agreement.map((row) => [
      row.doc_id,
      row.chapter_id,
      row.annotator_a,
      row.annotator_b,
      row.exact_f1.toFixed(4),
      row.tolerance_1_f1.toFixed(4),
    ]),
  ]

  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
}

function goldConfidenceCsv(bundle: EvaluationBundle) {
  const rows = [
    ["type", "count", "ratio"],
    ...bundle.gold_confidence_summary.map((row) => [
      row.type,
      String(row.count),
      row.ratio.toFixed(4),
    ]),
  ]

  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
}

function errorCases(bundle: EvaluationBundle) {
  return bundle.method_results.map((result) => ({
    prediction_id: result.prediction_id,
    method: result.method,
    label: result.label,
    doc_id: result.doc_id,
    chapter_id: result.chapter_id,
    false_positives_tolerance_1: result.false_positives_t1,
    false_negatives_tolerance_1: result.false_negatives_t1,
  }))
}

function paperTablesMarkdown(bundle: EvaluationBundle) {
  const lines = [
    "# Scene-Aware Chunking Evaluation Tables",
    "",
    "## Method Summary",
    "",
    "| Method | Chapter | Exact F1 | P +/-1 | R +/-1 | F1 +/-1 | Scene Count Error | Mean Distance |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...bundle.method_results.map(
      (result) =>
        `| ${result.label} | ${result.doc_id}/${result.chapter_id} | ${result.exact.f1.toFixed(3)} | ${result.tolerance_1.precision.toFixed(3)} | ${result.tolerance_1.recall.toFixed(3)} | ${result.tolerance_1.f1.toFixed(3)} | ${result.scene_count_error} | ${formatNumber(result.mean_pred_to_gold_distance)} |`,
    ),
    "",
    "## Human Agreement",
    "",
    "| Pair | Chapter | Exact F1 | F1 +/-1 |",
    "| --- | --- | ---: | ---: |",
    ...bundle.human_agreement.map(
      (row) =>
        `| ${row.annotator_a} vs ${row.annotator_b} | ${row.doc_id}/${row.chapter_id} | ${row.exact_f1.toFixed(3)} | ${row.tolerance_1_f1.toFixed(3)} |`,
    ),
    "",
    "## Gold Confidence",
    "",
    "| Type | Count | Ratio |",
    "| --- | ---: | ---: |",
    ...bundle.gold_confidence_summary.map(
      (row) => `| ${row.type} | ${row.count} | ${percent(row.ratio)} |`,
    ),
    "",
  ]

  return lines.join("\n")
}

function csvCell(value: string) {
  if (!/[",\n]/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '""')}"`
}
