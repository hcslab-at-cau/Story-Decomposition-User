"use client"

import { CheckCircle2, Download } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { useLanguage } from "@/components/LanguageProvider"
import type { ConsensusGold } from "@/types/annotation"
import type { DocumentSummary, NarrativeDocument } from "@/types/document"

export default function AdminPipelinePage() {
  const { t } = useLanguage()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [document, setDocument] = useState<NarrativeDocument | null>(null)
  const [docId, setDocId] = useState("")
  const [chapterId, setChapterId] = useState("")
  const [status, setStatus] = useState("")

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

  useEffect(() => {
    async function initialize() {
      try {
        const documentsResponse = await fetch("/api/documents")
        const documentsData = (await documentsResponse.json()) as { documents: DocumentSummary[] }
        setDocuments(documentsData.documents)
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

  function exportGoldJson() {
    if (!docId || !chapterId) return
    const params = new URLSearchParams({ doc_id: docId, chapter_id: chapterId })
    window.location.href = `/api/consensus/export?${params.toString()}`
  }

  return (
    <>
      <div className="topline">
        <div>
          <h1>{t("pipelineTitle")}</h1>
          <p className="subtle">{t("pipelineSubtitle")}</p>
        </div>
      </div>

      <section className="grid two">
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
          <h2>{t("goldBoundaryTools")}</h2>
          <p className="subtle">{t("goldBoundaryExportHint")}</p>
          <div className="toolbar">
            <button className="button" disabled={!docId || !chapterId} onClick={buildConsensus} type="button">
              <CheckCircle2 size={18} />
              {t("buildConsensus")}
            </button>
            <button className="button secondary" disabled={!docId || !chapterId} onClick={exportGoldJson} type="button">
              <Download size={18} />
              {t("exportGoldJson")}
            </button>
          </div>
          {status ? <div className="notice">{status}</div> : null}
        </div>
      </section>
    </>
  )
}
