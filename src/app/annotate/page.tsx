"use client"

import { LogOut, Save, UserCog } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { CSSProperties } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { LanguageSelect } from "@/components/LanguageSelect"
import { useLanguage } from "@/components/LanguageProvider"
import type { TranslationKey } from "@/lib/i18n"
import type { Annotation, BoundaryReason } from "@/types/annotation"
import type { DatasetTaskSummary, NarrativeDocument, Paragraph } from "@/types/document"
import type { DeviceInfo, ReadingEvent, StudyCondition, StudyLocation } from "@/types/study-results"

const reasonOptions: BoundaryReason[] = ["cast_change", "place_change", "time_change", "other"]
const studyConditions: StudyCondition[] = ["control", "on_demand", "auto_trigger"]
const DEFAULT_STUDY_ID = process.env.NEXT_PUBLIC_STUDY_ID ?? "scene_boundary_annotation_v1"
const DEFAULT_STUDY_CONDITION = normalizeStudyCondition(process.env.NEXT_PUBLIC_STUDY_CONDITION) ?? "control"

const reasonLabelKeys: Record<BoundaryReason, TranslationKey> = {
  cast_change: "reason_cast_change",
  place_change: "reason_place_change",
  time_change: "reason_time_change",
  other: "reason_other",
}

const reasonColors: Record<BoundaryReason, { color: string; soft: string }> = {
  cast_change: { color: "#b45309", soft: "rgba(180, 83, 9, 0.13)" },
  place_change: { color: "#2563eb", soft: "rgba(37, 99, 235, 0.12)" },
  time_change: { color: "#7c3aed", soft: "rgba(124, 58, 237, 0.12)" },
  other: { color: "#64748b", soft: "rgba(100, 116, 139, 0.14)" },
}

interface ParagraphBoundary {
  pid: number
  paragraph_index: number
  text: string
}

interface ClientStudySession {
  studyId: string
  sessionId: string
  condition: StudyCondition
  startTime: string
  deviceInfo: DeviceInfo
}

export default function AnnotatePage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [annotatorId, setAnnotatorId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [identityRole, setIdentityRole] = useState<"user" | "admin" | null>(null)
  const [tasks, setTasks] = useState<DatasetTaskSummary[]>([])
  const [document, setDocument] = useState<NarrativeDocument | null>(null)
  const [taskId, setTaskId] = useState("")
  const [docId, setDocId] = useState("")
  const [chapterId, setChapterId] = useState("")
  const [selectedBoundaryPids, setSelectedBoundaryPids] = useState<number[]>([])
  const [reasons, setReasons] = useState<Record<string, BoundaryReason[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("")
  const [condition, setCondition] = useState<StudyCondition>(DEFAULT_STUDY_CONDITION)
  const [studySession, setStudySession] = useState<ClientStudySession | null>(null)
  const eventBufferRef = useRef<ReadingEvent[]>([])
  const studySessionRef = useRef<ClientStudySession | null>(null)
  const latestLocationRef = useRef<StudyLocation | null>(null)
  const lastScrollRef = useRef<{ time: number; scrollY: number; location: StudyLocation | null }>({
    time: 0,
    scrollY: 0,
    location: null,
  })

  const selectedTask = useMemo(
    () => tasks.find((task) => task.task_id === taskId) ?? null,
    [taskId, tasks],
  )
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

  const flushReadingEvents = useCallback(() => {
    const session = studySessionRef.current

    if (!session || !annotatorId || eventBufferRef.current.length === 0) {
      return
    }

    const events = eventBufferRef.current.splice(0)

    void fetch("/api/study/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        study_id: session.studyId,
        participant_id: annotatorId,
        session_id: session.sessionId,
        reading_events: events,
      }),
    }).catch(() => {
      eventBufferRef.current = [...events.slice(-80), ...eventBufferRef.current].slice(-120)
    })
  }, [annotatorId])

  const queueReadingEvent = useCallback(
    (event: ReadingEvent) => {
      eventBufferRef.current.push({
        ...event,
        eventId: event.eventId ?? clientId("event"),
      })

      if (eventBufferRef.current.length >= 20) {
        flushReadingEvents()
      }
    },
    [flushReadingEvents],
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    const identityRaw = localStorage.getItem("scene_chunking_identity")
    const identity = identityRaw
      ? (JSON.parse(identityRaw) as {
          id?: string
          name?: string
          displayName?: string
          role?: "user" | "admin"
        })
      : null
    const fromQuery = url.searchParams.get("annotatorId")
    const resolvedId = fromQuery ?? identity?.id ?? identity?.name ?? ""

    if (!resolvedId) {
      router.push("/")
      return
    }

    setAnnotatorId(resolvedId)
    setDisplayName(fromQuery ? resolvedId : identity?.displayName ?? resolvedId)
    setIdentityRole(identity?.role ?? null)
    setCondition(normalizeStudyCondition(url.searchParams.get("condition")) ?? DEFAULT_STUDY_CONDITION)

    fetch("/api/documents")
      .then((response) => response.json())
      .then((data: { dataset_tasks?: DatasetTaskSummary[] }) => {
        const availableTasks = data.dataset_tasks ?? []
        setTasks(availableTasks)

        const initialTask =
          availableTasks.find((task) => task.task_id === url.searchParams.get("taskId")) ??
          availableTasks.find(
            (task) =>
              task.doc_id === url.searchParams.get("docId") &&
              task.chapter_id === url.searchParams.get("chapterId"),
          ) ??
          availableTasks[0]

        if (initialTask) {
          applyTask(initialTask)
        } else {
          setStatus(t("noDatasetTasks"))
        }
      })
      .catch(() => setStatus(t("couldNotLoadDocuments")))
  }, [router, t])

  useEffect(() => {
    if (!docId) return
    fetch(`/api/documents?docId=${encodeURIComponent(docId)}`)
      .then((response) => response.json())
      .then((data: { document: NarrativeDocument }) => {
        setDocument(data.document)
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

  useEffect(() => {
    if (!annotatorId || !selectedTask) return

    const session = getOrCreateStudySession(annotatorId, selectedTask.task_id, condition)
    setStudySession(session)
    studySessionRef.current = session
    latestLocationRef.current = null
    lastScrollRef.current = {
      time: Date.now(),
      scrollY: window.scrollY,
      location: null,
    }

    void fetch("/api/study/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        study_id: session.studyId,
        participant_id: annotatorId,
        session_id: session.sessionId,
        condition: session.condition,
        book_id: selectedTask.doc_id,
        chapter_id: selectedTask.chapter_id,
        task_id: selectedTask.task_id,
        assigned_order: selectedTask.sort_order,
        start_time: session.startTime,
        device_info: session.deviceInfo,
      }),
    }).catch(() => undefined)
  }, [annotatorId, condition, selectedTask])

  useEffect(() => {
    studySessionRef.current = studySession
  }, [studySession])

  useEffect(() => {
    if (!studySession || !chapter) return

    const interval = window.setInterval(flushReadingEvents, 5000)

    function handleScroll() {
      const now = Date.now()
      const last = lastScrollRef.current

      if (now - last.time < 1000) {
        return
      }

      const location = getCurrentReadingLocation()
      const direction =
        window.scrollY < last.scrollY - 8 ? "backward" : window.scrollY > last.scrollY + 8 ? "forward" : "same"
      latestLocationRef.current = location
      lastScrollRef.current = {
        time: now,
        scrollY: window.scrollY,
        location,
      }
      queueReadingEvent({
        eventType: direction === "backward" ? "back_scroll" : "scroll",
        timestamp: new Date(now).toISOString(),
        durationMs: Math.max(0, now - last.time),
        location,
        previousLocation: last.location ?? undefined,
        direction,
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
      window.clearInterval(interval)
      flushReadingEvents()
    }
  }, [chapter, flushReadingEvents, queueReadingEvent, studySession])

  useEffect(() => {
    if (!studySession || !selectedTask || !annotatorId) return
    const task = selectedTask
    const participantId = annotatorId

    function closeSession() {
      const session = studySessionRef.current
      if (!session) return

      const payload = JSON.stringify({
        study_id: session.studyId,
        participant_id: participantId,
        session_id: session.sessionId,
        condition: session.condition,
        book_id: task.doc_id,
        chapter_id: task.chapter_id,
        task_id: task.task_id,
        assigned_order: task.sort_order,
        start_time: session.startTime,
        end_time: new Date().toISOString(),
        device_info: session.deviceInfo,
      })

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/study/session", new Blob([payload], { type: "application/json" }))
      } else {
        void fetch("/api/study/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        })
      }
    }

    function handleVisibilityChange() {
      if (window.document.visibilityState === "hidden") {
        flushReadingEvents()
        closeSession()
      }
    }

    window.document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("beforeunload", closeSession)

    return () => {
      window.document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("beforeunload", closeSession)
    }
  }, [annotatorId, flushReadingEvents, selectedTask, studySession])

  function applyTask(task: DatasetTaskSummary) {
    setTaskId(task.task_id)
    setDocId(task.doc_id)
    setChapterId(task.chapter_id)
    setSelectedBoundaryPids([])
    setReasons({})
    setNotes({})
    setStatus("")
  }

  function toggleBoundary(pid: number) {
    if (!boundaryByPid.has(pid)) return
    const exists = selectedBoundaryPids.includes(pid)
    const location = { paragraphId: pid }

    queueReadingEvent({
      eventType: exists ? "boundary_unmark" : "boundary_mark",
      timestamp: new Date().toISOString(),
      location,
      previousLocation: latestLocationRef.current ?? undefined,
      direction: "same",
    })
    setSelectedBoundaryPids((current) => {
      const currentExists = current.includes(pid)
      const next = currentExists ? current.filter((item) => item !== pid) : [...current, pid]
      return sortBoundaryPids(next, paragraphs)
    })
  }

  function toggleReason(pid: number, reason: BoundaryReason) {
    const key = String(pid)

    setReasons((current) => {
      const existing = current[key] ?? []
      let next: BoundaryReason[]

      if (reason === "other") {
        next = existing.includes("other") ? [] : ["other"]
      } else {
        const compatibleReasons = existing.filter((item) => item !== "other")
        next = compatibleReasons.includes(reason)
          ? compatibleReasons.filter((item) => item !== reason)
          : [...compatibleReasons, reason]
      }

      const output = { ...current }
      const normalized = sortReasons(next)

      if (normalized.length > 0) {
        output[key] = normalized
      } else {
        delete output[key]
      }

      return output
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
        study_session: studySession
          ? {
              study_id: studySession.studyId,
              session_id: studySession.sessionId,
              condition: studySession.condition,
              task_id: selectedTask?.task_id,
              assigned_order: selectedTask?.sort_order,
              start_time: studySession.startTime,
              device_info: studySession.deviceInfo,
            }
          : undefined,
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
            <h1>{selectedTask?.label ?? chapter?.title ?? t("selectDatasetTask")}</h1>
            <p className="subtle">
              {document?.title ?? t("noDocument")} · {displayName || annotatorId}
            </p>
          </div>
          <div className="toolbar">
            <LanguageSelect />
            {identityRole === "admin" ? (
              <Link className="button secondary" href="/admin">
                <UserCog size={17} />
                {t("admin")}
              </Link>
            ) : null}
            <button className="button secondary" onClick={logout} type="button">
              <LogOut size={17} />
              {t("logout")}
            </button>
          </div>
        </div>

        <div className="reader-controls">
          <label className="field">
            <span>{t("datasetTask")}</span>
            <select
              className="select"
              value={taskId}
              onChange={(event) => {
                const nextTask = tasks.find((task) => task.task_id === event.target.value)
                if (nextTask) applyTask(nextTask)
              }}
            >
              {tasks.map((task) => (
                <option key={task.task_id} value={task.task_id}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="notice reader-notice">
          {t("markBoundaryInstruction")}
          <span>{t("paragraphClickHint")}</span>
        </div>

        <article className="reader-document" aria-label={selectedTask?.label ?? chapter?.title ?? t("selectDatasetTask")}>
          {paragraphs.map((paragraph, index) => {
            const selectable = index > 0
            const selected = selectedBoundarySet.has(paragraph.pid)
            const selectedReasons = reasons[String(paragraph.pid)] ?? []

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
                data-pid={paragraph.pid}
                style={boundaryStyle(selectedReasons)}
                type="button"
              >
                {selectable ? (
                  <span className="scene-boundary-line" aria-hidden="true">
                    <span className="scene-boundary-label">
                      {selected ? reasonSummary(selectedReasons, t) : t("sceneStartPreview")}
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
          {selectedBoundaries.map((boundary) => {
            const boundaryReasons = reasons[String(boundary.pid)] ?? []

            return (
              <div className="boundary-item paragraph-boundary-item" key={boundary.pid}>
                <div>
                  <strong>
                    {t("paragraphSceneStart", { paragraph: boundary.paragraph_index, pid: boundary.pid })}
                  </strong>
                  <p className="selected-paragraph-preview">{boundary.text}</p>
                  <fieldset className="reason-field">
                    <legend>{t("reason")}</legend>
                    <div className="reason-checkbox-grid">
                      {reasonOptions.map((reason) => {
                        const checked = boundaryReasons.includes(reason)

                        return (
                          <label
                            className={["reason-chip", checked ? "checked" : ""].filter(Boolean).join(" ")}
                            key={reason}
                            style={reasonChipStyle(reason)}
                          >
                            <input
                              checked={checked}
                              onChange={() => toggleReason(boundary.pid, reason)}
                              type="checkbox"
                            />
                            <span>{t(reasonLabelKeys[reason])}</span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
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
            )
          })}
        </div>
      </aside>
    </main>
  )
}

function normalizeStudyCondition(value: unknown): StudyCondition | null {
  if (typeof value !== "string") return null
  return studyConditions.includes(value as StudyCondition) ? (value as StudyCondition) : null
}

function getOrCreateStudySession(
  participantId: string,
  taskId: string,
  condition: StudyCondition,
): ClientStudySession {
  const storageKey = `scene_chunking_session_${DEFAULT_STUDY_ID}_${participantId}_${taskId}_${condition}`
  const stored = readStoredStudySession(storageKey)

  if (stored) {
    return stored
  }

  const session: ClientStudySession = {
    studyId: DEFAULT_STUDY_ID,
    sessionId: clientId("session"),
    condition,
    startTime: new Date().toISOString(),
    deviceInfo: readDeviceInfo(),
  }

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(session))
  } catch {
    // Session logging still works without browser storage; it just creates a new session after reload.
  }

  return session
}

function readStoredStudySession(storageKey: string) {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ClientStudySession

    if (parsed.sessionId && parsed.startTime && normalizeStudyCondition(parsed.condition)) {
      return {
        ...parsed,
        studyId: parsed.studyId || DEFAULT_STUDY_ID,
        deviceInfo: parsed.deviceInfo ?? readDeviceInfo(),
      }
    }
  } catch {
    return null
  }

  return null
}

function readDeviceInfo(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  }
}

function getCurrentReadingLocation(): StudyLocation {
  const targets = Array.from(document.querySelectorAll<HTMLElement>(".paragraph-boundary-target[data-pid]"))
  let best: { distance: number; pid: number } | null = null

  for (const target of targets) {
    const pid = Number(target.dataset.pid)
    if (!Number.isFinite(pid)) continue

    const rect = target.getBoundingClientRect()
    if (rect.bottom < 96 || rect.top > window.innerHeight) continue

    const distance = Math.abs(rect.top - 120)
    if (!best || distance < best.distance) {
      best = { distance, pid }
    }
  }

  return best ? { paragraphId: best.pid } : {}
}

function clientId(prefix: string) {
  if (crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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

function normalizeReasonRecord(record: Record<string, BoundaryReason | BoundaryReason[]>) {
  const normalized: Record<string, BoundaryReason[]> = {}

  for (const [key, value] of Object.entries(record)) {
    const pid = boundaryKeyToPid(key)
    const reasons = normalizeReasons(value)

    if (pid !== null && reasons.length > 0) {
      normalized[String(pid)] = reasons
    }
  }

  return normalized
}

function normalizeReasons(value: BoundaryReason | BoundaryReason[]) {
  const values = Array.isArray(value) ? value : [value]
  const validValues = values.filter((reason): reason is BoundaryReason => reasonOptions.includes(reason))

  if (validValues.includes("other")) {
    return ["other" as const]
  }

  return sortReasons(validValues)
}

function sortReasons(reasons: BoundaryReason[]) {
  return reasonOptions.filter((reason) => reasons.includes(reason))
}

type BoundaryCssProperties = CSSProperties & {
  "--boundary-color"?: string
  "--boundary-soft"?: string
  "--boundary-gradient"?: string
  "--reason-color"?: string
  "--reason-soft"?: string
}

function boundaryStyle(reasons: BoundaryReason[]): BoundaryCssProperties {
  const colors = reasons.length > 0 ? reasons.map((reason) => reasonColors[reason].color) : []
  const firstReason = reasons[0]

  return {
    "--boundary-color": firstReason ? reasonColors[firstReason].color : undefined,
    "--boundary-soft": firstReason ? reasonColors[firstReason].soft : undefined,
    "--boundary-gradient": colors.length > 1 ? `linear-gradient(90deg, ${colors.join(", ")})` : colors[0],
  }
}

function reasonChipStyle(reason: BoundaryReason): BoundaryCssProperties {
  return {
    "--reason-color": reasonColors[reason].color,
    "--reason-soft": reasonColors[reason].soft,
  }
}

function reasonSummary(
  reasons: BoundaryReason[],
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
) {
  if (reasons.length === 0) {
    return t("sceneStartsHere")
  }

  return reasons.map((reason) => t(reasonLabelKeys[reason])).join(" · ")
}

function pickRecordByPids<T>(record: Record<string, T>, pids: number[]) {
  const picked: Record<string, T> = {}

  for (const pid of pids) {
    const key = String(pid)
    const value = record[key]

    if (Array.isArray(value) && value.length === 0) {
      continue
    }

    if (value !== undefined) {
      picked[key] = value
    }
  }

  return picked
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
