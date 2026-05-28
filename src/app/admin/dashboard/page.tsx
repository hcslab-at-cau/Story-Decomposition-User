"use client"

import { Download, PlayCircle, RefreshCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { useLanguage } from "@/components/LanguageProvider"
import type { EvaluationBundle } from "@/types/evaluation"

interface ProgressRow {
  doc_id: string
  document_title: string
  chapter_id: string
  chapter_title: string
  paragraph_count: number
  annotation_count: number
  annotators: Array<{
    annotator_id: string
    boundary_count: number
    updated_at: string
  }>
  has_consensus: boolean
  gold_boundary_count: number
  ambiguous_boundary_count: number
  prediction_count: number
}

interface ParticipantProgress {
  id: string
  display_name: string
  annotation_count: number
  boundary_count: number
  last_updated: string | null
}

interface ProgressResponse {
  summary: {
    document_count: number
    chapter_count: number
    annotation_count: number
    consensus_count: number
    prediction_count: number
  }
  participants: ParticipantProgress[]
  chapters: ProgressRow[]
}

export default function AdminDashboardPage() {
  const { t } = useLanguage()
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationBundle | null>(null)
  const [selectedParticipantId, setSelectedParticipantId] = useState("")
  const [status, setStatus] = useState("")

  const targetChapterKeys = useMemo(
    () => new Set((progress?.chapters ?? []).map((chapter) => chapterKey(chapter.doc_id, chapter.chapter_id))),
    [progress],
  )
  const targetChaptersReady = targetChapterKeys.size > 0
  const visibleMethodResults = useMemo(() => {
    if (!evaluation || !targetChaptersReady) return []

    return evaluation.method_results.filter((result) =>
      targetChapterKeys.has(chapterKey(result.doc_id, result.chapter_id)),
    )
  }, [evaluation, targetChapterKeys, targetChaptersReady])
  const visibleHumanAgreement = useMemo(() => {
    if (!evaluation || !targetChaptersReady) return []

    return evaluation.human_agreement.filter((row) =>
      targetChapterKeys.has(chapterKey(row.doc_id, row.chapter_id)),
    )
  }, [evaluation, targetChapterKeys, targetChaptersReady])
  const meanHumanF1 = useMemo(() => {
    if (!visibleHumanAgreement.length) return null
    const sum = visibleHumanAgreement.reduce((total, row) => total + row.tolerance_1_f1, 0)
    return sum / visibleHumanAgreement.length
  }, [visibleHumanAgreement])

  const activeParticipantId = selectedParticipantId || "all"
  const participants = progress?.participants ?? []
  const selectedParticipant =
    activeParticipantId === "all"
      ? null
      : participants.find((participant) => participant.id === activeParticipantId) ?? null
  const participantScoped = activeParticipantId !== "all"
  const visibleChapters = useMemo(() => {
    if (!progress) return []

    if (!participantScoped) {
      return progress.chapters
    }

    return progress.chapters.map((chapter) => {
      const annotators = chapter.annotators.filter(
        (annotator) => annotator.annotator_id === activeParticipantId,
      )

      return {
        ...chapter,
        annotation_count: annotators.length,
        annotators,
      }
    })
  }, [activeParticipantId, participantScoped, progress])

  async function loadProgress() {
    const response = await fetch("/api/progress")
    const data = (await response.json()) as ProgressResponse
    setProgress(data)
  }

  async function runEvaluation() {
    setStatus(t("runningEvaluation"))
    const response = await fetch("/api/evaluate", { method: "POST" })
    const data = (await response.json()) as { evaluation: EvaluationBundle }
    setEvaluation(data.evaluation)
    setStatus(`${t("evaluationComplete")}: ${data.evaluation.method_results.length}`)
    await loadProgress()
  }

  useEffect(() => {
    loadProgress().catch(() => setStatus(t("couldNotLoadProgress")))
    fetch("/api/evaluate")
      .then((response) => response.json())
      .then((data: { evaluation: EvaluationBundle }) => setEvaluation(data.evaluation))
      .catch(() => undefined)
  }, [t])

  useEffect(() => {
    if (!progress || selectedParticipantId) return
    const testParticipant = progress.participants.find((participant) => participant.id === "test01")
    setSelectedParticipantId(testParticipant?.id ?? "all")
  }, [progress, selectedParticipantId])

  const summary = progress?.summary

  return (
    <>
      <div className="topline">
        <div>
          <h1>{t("dashboardTitle")}</h1>
          <p className="subtle">{t("dashboardSubtitle")}</p>
        </div>
        <div className="toolbar">
          <a className="button secondary" href="/api/annotations/export?type=boundaries">
            <Download size={17} />
            {t("exportBoundariesCsv")}
          </a>
          <a className="button secondary" href="/api/annotations/export?type=submissions">
            <Download size={17} />
            {t("exportSubmissionsCsv")}
          </a>
          <button className="button secondary" onClick={() => loadProgress()} type="button">
            <RefreshCcw size={17} />
            {t("refresh")}
          </button>
          <button className="button" onClick={runEvaluation} type="button">
            <PlayCircle size={17} />
            {t("evaluate")}
          </button>
        </div>
      </div>

      <section className="grid three">
        <Stat label={t("chapters")} value={summary?.chapter_count ?? 0} />
        <Stat label={t("annotations")} value={summary?.annotation_count ?? 0} />
        <Stat label={t("humanF1")} value={meanHumanF1 === null ? "-" : meanHumanF1.toFixed(2)} />
      </section>

      <section className="card dashboard-filter" style={{ marginTop: 16 }}>
        <label className="field">
          <span>{t("viewingAnnotator")}</span>
          <select
            className="select"
            value={activeParticipantId}
            onChange={(event) => setSelectedParticipantId(event.target.value)}
          >
            <option value="all">{t("allAnnotators")}</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participantLabel(participant)}
              </option>
            ))}
          </select>
        </label>

        {selectedParticipant ? (
          <div className="participant-summary">
            <div>
              <span className="subtle">{t("completedDatasets")}</span>
              <strong>{selectedParticipant.annotation_count}</strong>
            </div>
            <div>
              <span className="subtle">{t("totalBoundaries")}</span>
              <strong>{selectedParticipant.boundary_count}</strong>
            </div>
            <div>
              <span className="subtle">{t("lastUpdated")}</span>
              <strong>{formatLastUpdated(selectedParticipant.last_updated, t("notStarted"))}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {status ? (
        <div className="notice" style={{ marginTop: 16 }}>
          {status}
        </div>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("annotatorProgress")}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("chapter")}</th>
                <th>{participantScoped ? t("annotations") : t("annotators")}</th>
                <th>{t("consensus")}</th>
                <th>{t("predictions")}</th>
                <th>{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleChapters.map((chapter) => (
                <tr key={`${chapter.doc_id}-${chapter.chapter_id}`}>
                  <td>
                    <strong>{chapter.document_title}</strong>
                    <div className="subtle">
                      {chapter.chapter_id}: {chapter.chapter_title}
                    </div>
                    <div className="subtle">
                      {chapter.paragraph_count} {t("paragraphs").toLowerCase()}
                    </div>
                  </td>
                  <td>
                    {chapter.annotators.length === 0 ? (
                      <span className="pill warn">{t("noAnnotations")}</span>
                    ) : (
                      chapter.annotators.map((annotator) => (
                        <div key={annotator.annotator_id}>
                          {annotator.annotator_id}: {annotator.boundary_count} {t("boundaries")}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    {chapter.has_consensus ? (
                      <span className="pill">
                        {chapter.gold_boundary_count} {t("gold")}
                      </span>
                    ) : (
                      <span className="pill warn">{t("missing")}</span>
                    )}
                    {chapter.ambiguous_boundary_count ? (
                      <div className="subtle">
                        {chapter.ambiguous_boundary_count} {t("ambiguous")}
                      </div>
                    ) : null}
                  </td>
                  <td>{chapter.prediction_count}</td>
                  <td>
                    {participantScoped ? (
                      chapter.annotators.length > 0 ? (
                        <span className="pill">{t("saved")}</span>
                      ) : (
                        <span className="pill warn">{t("notStarted")}</span>
                      )
                    ) : chapter.annotation_count >= 3 && chapter.has_consensus && chapter.prediction_count > 0 ? (
                      <span className="pill">{t("ready")}</span>
                    ) : (
                      <span className="pill blue">{t("inProgress")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>{t("methodResults")}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("method")}</th>
                  <th>{t("chapter")}</th>
                  <th>{t("exactF1")}</th>
                  <th>F1 +/-1</th>
                  <th>{t("sceneError")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleMethodResults.map((result) => (
                  <tr key={result.prediction_id}>
                    <td>{result.label}</td>
                    <td>
                      {result.doc_id}/{result.chapter_id}
                    </td>
                    <td>{result.exact.f1.toFixed(3)}</td>
                    <td>{result.tolerance_1.f1.toFixed(3)}</td>
                    <td>{result.scene_count_error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>{t("humanAgreement")}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("pair")}</th>
                  <th>{t("chapter")}</th>
                  <th>F1 +/-1</th>
                </tr>
              </thead>
              <tbody>
                {visibleHumanAgreement.map((row) => (
                  <tr key={`${row.doc_id}-${row.chapter_id}-${row.annotator_a}-${row.annotator_b}`}>
                    <td>
                      {row.annotator_a} / {row.annotator_b}
                    </td>
                    <td>
                      {row.doc_id}/{row.chapter_id}
                    </td>
                    <td>{row.tolerance_1_f1.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}

function participantLabel(participant: ParticipantProgress) {
  if (participant.display_name === participant.id) {
    return participant.id
  }

  return `${participant.display_name} (${participant.id})`
}

function formatLastUpdated(value: string | null, fallback: string) {
  if (!value) {
    return fallback
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

function chapterKey(docId: string, chapterId: string) {
  return `${docId}::${chapterId}`
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="card stat">
      <span className="subtle">{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
