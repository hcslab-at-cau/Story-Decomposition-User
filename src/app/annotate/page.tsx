"use client"

import { LogOut, Save, UserCog } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { LanguageSelect } from "@/components/LanguageSelect"
import { useLanguage } from "@/components/LanguageProvider"
import type { TranslationKey } from "@/lib/i18n"
import type { Annotation, BoundaryReason } from "@/types/annotation"
import type { DocumentSummary, NarrativeDocument, Paragraph } from "@/types/document"

const reasonOptions: BoundaryReason[] = [
  "place_change",
  "time_change",
  "cast_change",
  "event_or_goal_change",
  "narrative_focus_change",
  "other",
  "unsure",
]

const reasonLabelKeys: Record<BoundaryReason, TranslationKey> = {
  place_change: "reason_place_change",
  time_change: "reason_time_change",
  cast_change: "reason_cast_change",
  event_or_goal_change: "reason_event_or_goal_change",
  narrative_focus_change: "reason_narrative_focus_change",
  other: "reason_other",
  unsure: "reason_unsure",
}

interface ParagraphBoundary {
  pid: number
  paragraph_index: number
  text: string
}

export default function AnnotatePage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [annotatorId, setAnnotatorId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [document, setDocument] = useState<NarrativeDocument | null>(null)
  const [docId, setDocId] = useState("")
  const [chapterId, setChapterId] = useState("")
  const [selectedBoundaryPids, setSelectedBoundaryPids] = useState<number[]>([])
  const [reasons, setReasons] = useState<Record<string, BoundaryReason>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("")

  const chapter = useMemo(
    () => document?.chapters.find((item) => item.chapter_id === chapterId) ?? null,
    [chapterId, document],
  )
  const paragraphs = useMemo(() => chapter?.paragraphs ?? [], [chapter])
  const boundaryOptions = useMemo(
    () =>
      paragraphs
        .map((paragraph, index) =>
          index === 0
            ? null
            : {
                pid: paragraph.pid,
                paragraph_index: index + 1,
                text: paragraph.text,
              },
        )
        .filter((boundary): boundary is ParagraphBoundary => Boolean(boundary)),
    [paragraphs],
  )
  const boundaryByPid = useMemo(
    () => new Map(boundaryOptions.map((boundary) => [boundary.pid, boundary] as const)),
    [boundaryOptions],
  )
  const selectedBoundarySet = useMemo(() => new Set(selectedBoundaryPids), [selectedBoundaryPids])
  const selectedBoundaries = useMemo(
    () =>
      selectedBoundaryPids
        .map((pid) => boundaryByPid.get(pid))
        .filter((boundary): boundary is ParagraphBoundary => Boolean(boundary)),
    [boundaryByPid, selectedBoundaryPids],
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    const identityRaw = localStorage.getItem("scene_chunking_identity")
    const identity = identityRaw
      ? (JSON.parse(identityRaw) as { id?: string; name?: string; displayName?: string })
      : null
    const fromQuery = url.searchParams.get("annotatorId")
    const resolvedId = fromQuery ?? identity?.id ?? identity?.name ?? ""

    if (!resolvedId) {
      router.push("/")
      return
    }

    setAnnotatorId(resolvedId)
    setDisplayName(identity?.displayName ?? resolvedId)

    fetch("/api/documents")
      .then((response) => response.json())
      .then((data: { documents: DocumentSummary[] }) => {
        setDocuments(data.documents)
        const initialDoc = url.searchParams.get("docId") ?? data.documents[0]?.doc_id ?? ""
        setDocId(initialDoc)
      })
      .catch(() => setStatus(t("couldNotLoadDocuments")))
  }, [router, t])

  useEffect(() => {
    if (!docId) return
    fetch(`/api/documents?docId=${encodeURIComponent(docId)}`)
      .then((response) => response.json())
      .then((data: { document: NarrativeDocument }) => {
        setDocument(data.document)
        setChapterId((current) =>
          data.document.chapters.some((chapterItem) => chapterItem.chapter_id === current)
            ? current
            : data.document.chapters[0]?.chapter_id || "",
        )
      })
      .catch(() => setStatus(t("couldNotLoadDocument")))
  }, [docId, t])

  useEffect(() => {
    if (!docId || !chapterId || !annotatorId || !chapter) return
    fetch(
      `/api/annotations?docId=${encodeURIComponent(docId)}&chapterId=${encodeURIComponent(
        chapterId,
      )}&annotatorId=${encodeURIComponent(annotatorId)}`,
    )
      .then((response) => response.json())
      .then((data: { annotation: Annotation | null }) => {
        const annotation = data.annotation
        const migratedPids = annotation?.boundary_before_pids.length
          ? annotation.boundary_before_pids
          : sentenceIdsToParagraphPids(annotation?.boundary_sentence_ids ?? [])
        const validPids = sortBoundaryPids(
          migratedPids.filter((pid) => boundaryByPid.has(pid)),
          paragraphs,
        )

        setSelectedBoundaryPids(validPids)
        setReasons(normalizeReasonRecord(annotation?.boundary_reasons ?? {}))
        setNotes(normalizeNoteRecord(annotation?.notes ?? {}))
        setStatus(annotation ? t("loadedSavedAnnotation") : t("noSavedAnnotation"))
      })
      .catch(() => setStatus(t("couldNotLoadAnnotation")))
  }, [annotatorId, boundaryByPid, chapter, chapterId, docId, paragraphs, t])

  function toggleBoundary(pid: number) {
    if (!boundaryByPid.has(pid)) return
    setSelectedBoundaryPids((current) => {
      const exists = current.includes(pid)
      const next = exists ? current.filter((item) => item !== pid) : [...current, pid]
      return sortBoundaryPids(next, paragraphs)
    })
  }

  async function saveAnnotation() {
    if (!docId || !chapterId || !annotatorId) return
    setStatus(t("saving"))
    const boundaryPoints = selectedBoundaries.map((boundary) => ({
      pid: boundary.pid,
      boundary_before_pid: boundary.pid,
      paragraph_index: boundary.paragraph_index,
      paragraph_text: boundary.text,
    }))

    const response = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: docId,
        chapter_id: chapterId,
        annotator_id: annotatorId,
        boundary_before_pids: selectedBoundaryPids,
        boundary_sentence_ids: [],
        boundary_points: boundaryPoints,
        boundary_reasons: pickRecordByPids(reasons, selectedBoundaryPids),
        notes: pickRecordByPids(notes, selectedBoundaryPids),
      }),
    })
    const data = (await response.json()) as { annotation?: Annotation; error?: string }
    setStatus(response.ok && data.annotation ? t("saved") : data.error ?? t("saveFailed"))
  }

  function logout() {
    localStorage.removeItem("scene_chunking_identity")
    router.push("/")
  }

  return (
    <main className="annotate-shell">
      <section className="reader-pane">
        <div className="topline">
          <div>
            <div className="eyebrow">{t("boundaryAnnotation")}</div>
            <h1>{chapter?.title ?? t("selectChapter")}</h1>
            <p className="subtle">
              {document?.title ?? t("noDocument")} · {displayName || annotatorId}
            </p>
          </div>
          <div className="toolbar">
            <LanguageSelect />
            <Link className="button secondary" href="/admin">
              <UserCog size={17} />
              {t("admin")}
            </Link>
            <button className="button secondary" onClick={logout} type="button">
              <LogOut size={17} />
              {t("logout")}
            </button>
          </div>
        </div>

        <div className="reader-controls">
          <label className="field">
            <span>{t("document")}</span>
            <select className="select" value={docId} onChange={(event) => setDocId(event.target.value)}>
              {documents.map((item) => (
                <option key={item.doc_id} value={item.doc_id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("chapter")}</span>
            <select className="select" value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              {document?.chapters.map((item) => (
                <option key={item.chapter_id} value={item.chapter_id}>
                  {t("chapter")} {item.chapter_index} - {item.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="notice reader-notice">
          {t("markBoundaryInstruction")}
          <span>{t("paragraphClickHint")}</span>
        </div>

        <article className="reader-document" aria-label={chapter?.title ?? t("selectChapter")}>
          {paragraphs.map((paragraph, index) => {
            const selectable = index > 0
            const selected = selectedBoundarySet.has(paragraph.pid)

            return (
              <button
                aria-pressed={selectable ? selected : undefined}
                className={[
                  "paragraph-boundary-target",
                  selectable ? "can-boundary" : "",
                  selected ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!selectable}
                key={paragraph.pid}
                onClick={() => toggleBoundary(paragraph.pid)}
                type="button"
              >
                {selectable ? (
                  <span className="scene-boundary-line" aria-hidden="true">
                    <span className="scene-boundary-label">
                      {selected ? t("sceneStartsHere") : t("sceneStartPreview")}
                    </span>
                  </span>
                ) : null}
                <span className="paragraph-text">{paragraph.text}</span>
              </button>
            )
          })}
        </article>
      </section>

      <aside className="annotation-panel">
        <div className="topline">
          <div>
            <h2>{t("selectedBoundaries")}</h2>
            <p className="subtle">
              {selectedBoundaries.length} {t("marked")}
            </p>
          </div>
        </div>

        <button className="button" onClick={saveAnnotation} type="button">
          <Save size={18} />
          {t("save")}
        </button>

        {status ? (
          <div className="notice" style={{ marginTop: 12 }}>
            {status}
          </div>
        ) : null}

        <div className="boundary-list">
          {selectedBoundaries.map((boundary) => (
            <div className="boundary-item paragraph-boundary-item" key={boundary.pid}>
              <div>
                <strong>
                  {t("paragraphSceneStart", { paragraph: boundary.paragraph_index, pid: boundary.pid })}
                </strong>
                <p className="selected-paragraph-preview">{boundary.text}</p>
                <label className="field" style={{ marginTop: 8 }}>
                  <span>{t("reason")}</span>
                  <select
                    className="select"
                    value={reasons[String(boundary.pid)] ?? "unsure"}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [String(boundary.pid)]: event.target.value as BoundaryReason,
                      }))
                    }
                  >
                    {reasonOptions.map((reason) => (
                      <option key={reason} value={reason}>
                        {t(reasonLabelKeys[reason])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ marginTop: 8 }}>
                  <span>{t("note")}</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 80 }}
                    value={notes[String(boundary.pid)] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [String(boundary.pid)]: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button className="button secondary" onClick={() => toggleBoundary(boundary.pid)} type="button">
                {t("remove")}
              </button>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}

function sentenceIdsToParagraphPids(sentenceIds: string[]) {
  return sentenceIds
    .map((sentenceId) => Number(sentenceId.split(":")[0]))
    .filter((pid) => Number.isFinite(pid))
}

function sortBoundaryPids(pids: number[], paragraphs: Paragraph[]) {
  const paragraphOrder = new Map(paragraphs.map((paragraph, index) => [paragraph.pid, index] as const))
  return Array.from(new Set(pids)).sort(
    (left, right) =>
      (paragraphOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (paragraphOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  )
}

function boundaryKeyToPid(key: string) {
  const pid = Number(key.includes(":") ? key.split(":")[0] : key)
  return Number.isFinite(pid) ? pid : null
}

function normalizeReasonRecord(record: Record<string, BoundaryReason>) {
  const normalized: Record<string, BoundaryReason> = {}

  for (const [key, value] of Object.entries(record)) {
    const pid = boundaryKeyToPid(key)
    if (pid !== null) {
      normalized[String(pid)] = value
    }
  }

  return normalized
}

function normalizeNoteRecord(record: Record<string, string>) {
  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(record)) {
    const pid = boundaryKeyToPid(key)
    if (pid !== null) {
      normalized[String(pid)] = value
    }
  }

  return normalized
}

function pickRecordByPids<T>(record: Record<string, T>, pids: number[]) {
  const picked: Record<string, T> = {}

  for (const pid of pids) {
    const key = String(pid)
    if (record[key] !== undefined) {
      picked[key] = record[key]
    }
  }

  return picked
}
