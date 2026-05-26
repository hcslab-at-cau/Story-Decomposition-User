"use client"

import { CheckCircle2, FileJson, PlayCircle, RefreshCcw, SplitSquareHorizontal } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"

import { useLanguage } from "@/components/LanguageProvider"
import type { ConsensusGold } from "@/types/annotation"
import type { DocumentSummary, NarrativeDocument } from "@/types/document"
import type { EvaluationBundle } from "@/types/evaluation"
import type { Prediction } from "@/types/prediction"

export default function AdminPipelinePage() {
  const { t } = useLanguage()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [document, setDocument] = useState<NarrativeDocument | null>(null)
  const [docId, setDocId] = useState("")
  const [chapterId, setChapterId] = useState("")
  const [k, setK] = useState(5)
  const [state3Json, setState3Json] = useState("")
  const [status, setStatus] = useState("")
  const [predictions, setPredictions] = useState<Prediction[]>([])

  const selectedChapter = useMemo(
    () => document?.chapters.find((chapter) => chapter.chapter_id === chapterId) ?? null,
    [chapterId, document],
  )

  async function loadDocument(nextDocId: string) {
    if (!nextDocId) return
    const response = await fetch(`/api/documents?docId=${encodeURIComponent(nextDocId)}`)
    const data = (await response.json()) as { document: NarrativeDocument }
    setDocument(data.document)
    setChapterId(data.document.chapters[0]?.chapter_id ?? "")
  }

  async function loadPredictions() {
    const response = await fetch("/api/predictions")
    const data = (await response.json()) as { predictions: Prediction[] }
    setPredictions(data.predictions)
  }

  useEffect(() => {
    async function initialize() {
      try {
        const [documentsResponse, predictionsResponse] = await Promise.all([
          fetch("/api/documents"),
          fetch("/api/predictions"),
        ])
        const documentsData = (await documentsResponse.json()) as { documents: DocumentSummary[] }
        const predictionsData = (await predictionsResponse.json()) as { predictions: Prediction[] }
        setDocuments(documentsData.documents)
        setPredictions(predictionsData.predictions)
        if (documentsData.documents[0]) {
          setDocId(documentsData.documents[0].doc_id)
        }
      } catch {
        setStatus(t("couldNotLoadPipeline"))
      }
    }

    initialize()
  }, [t])

  useEffect(() => {
    loadDocument(docId).catch(() => setStatus(t("couldNotLoadSelectedDocument")))
  }, [docId, t])

  async function buildConsensus() {
    setStatus(t("buildingConsensus"))
    const response = await fetch("/api/consensus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_id: docId, chapter_id: chapterId, tolerance: 1 }),
    })
    const data = (await response.json()) as { consensus?: ConsensusGold; error?: string }
    if (!response.ok || !data.consensus) {
      setStatus(data.error ?? t("missing"))
      return
    }
    setStatus(`${t("goldBoundaries")}: ${data.consensus.gold_boundaries.length}`)
  }

  async function generateFixedSize() {
    setStatus(t("generatingFixedSize"))
    const response = await fetch("/api/pipeline/fixed-size", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_id: docId, chapter_id: chapterId, k }),
    })
    const data = (await response.json()) as { prediction?: Prediction; error?: string }
    if (!response.ok || !data.prediction) {
      setStatus(data.error ?? t("saveFailed"))
      return
    }
    setStatus(`${t("predictionSaved")}: ${data.prediction.boundary_before_pids.length} ${t("boundaries")}`)
    await loadPredictions()
  }

  async function importState3(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(t("importingState3"))
    try {
      const parsed = JSON.parse(state3Json)
      const response = await fetch("/api/pipeline/state3-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: docId, chapter_id: chapterId, state3: parsed }),
      })
      const data = (await response.json()) as { prediction?: Prediction; error?: string }
      if (!response.ok || !data.prediction) {
        throw new Error(data.error ?? t("saveFailed"))
      }
      setStatus(`${t("state3Imported")}: ${data.prediction.boundary_before_pids.length} ${t("boundaries")}`)
      setState3Json("")
      await loadPredictions()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saveFailed"))
    }
  }

  async function runEvaluation() {
    setStatus(t("runningEvaluation"))
    const response = await fetch("/api/evaluate", { method: "POST" })
    const data = (await response.json()) as { evaluation?: EvaluationBundle; error?: string }
    if (!response.ok || !data.evaluation) {
      setStatus(data.error ?? t("saveFailed"))
      return
    }
    setStatus(`${t("evaluationComplete")}: ${data.evaluation.method_results.length}`)
  }

  return (
    <>
      <div className="topline">
        <div>
          <h1>{t("pipelineTitle")}</h1>
          <p className="subtle">{t("pipelineSubtitle")}</p>
        </div>
        <button className="button secondary" onClick={() => loadPredictions()} type="button">
          <RefreshCcw size={17} />
          {t("refresh")}
        </button>
      </div>

      <section className="grid two">
        <div className="grid">
          <div className="card form-grid">
            <h2>{t("targetChapter")}</h2>
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
              <select
                className="select"
                value={chapterId}
                onChange={(event) => setChapterId(event.target.value)}
              >
                {document?.chapters.map((chapter) => (
                  <option key={chapter.chapter_id} value={chapter.chapter_id}>
                    {t("chapter")} {chapter.chapter_index} - {chapter.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedChapter ? (
              <div className="notice">
                {selectedChapter.paragraphs.length} {t("paragraphs").toLowerCase()} · {selectedChapter.title}
              </div>
            ) : null}
          </div>

          <div className="card form-grid">
            <h2>{t("goldBaselines")}</h2>
            <div className="toolbar">
              <button className="button" disabled={!docId || !chapterId} onClick={buildConsensus} type="button">
                <CheckCircle2 size={18} />
                {t("buildConsensus")}
              </button>
              <label className="field" style={{ width: 140 }}>
                <span>{t("fixedK")}</span>
                <input
                  className="input"
                  min={2}
                  type="number"
                  value={k}
                  onChange={(event) => setK(Number(event.target.value))}
                />
              </label>
              <button
                className="button secondary"
                disabled={!docId || !chapterId}
                onClick={generateFixedSize}
                type="button"
              >
                <SplitSquareHorizontal size={18} />
                {t("fixedSize")}
              </button>
            </div>
            <button className="button warning" onClick={runEvaluation} type="button">
              <PlayCircle size={18} />
              {t("runEvaluation")}
            </button>
            {status ? <div className="notice">{status}</div> : null}
          </div>
        </div>

        <form className="card form-grid" onSubmit={importState3}>
          <h2>{t("state3Import")}</h2>
          <label className="field">
            <span>{t("json")}</span>
            <textarea
              className="textarea"
              value={state3Json}
              onChange={(event) => setState3Json(event.target.value)}
              placeholder='{"boundaries":[...],"scenes":[...]}'
            />
          </label>
          <button className="button" disabled={!state3Json.trim() || !docId || !chapterId} type="submit">
            <FileJson size={18} />
            {t("importPrediction")}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>{t("savedPredictions")}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("title")}</th>
                <th>{t("chapter")}</th>
                <th>{t("boundaries")}</th>
                <th>{t("created")}</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((prediction) => (
                <tr key={prediction.prediction_id}>
                  <td>{prediction.label}</td>
                  <td>
                    {prediction.doc_id}/{prediction.chapter_id}
                  </td>
                  <td>{prediction.boundary_before_pids.join(", ") || "-"}</td>
                  <td>{new Date(prediction.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
