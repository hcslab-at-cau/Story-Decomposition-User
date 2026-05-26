"use client"

import { CloudDownload, FileUp, RefreshCcw, Trash2 } from "lucide-react"
import { FormEvent, useEffect, useState } from "react"

import { useLanguage } from "@/components/LanguageProvider"
import type { DocumentSummary, NarrativeDocument } from "@/types/document"

interface DocumentsResponse {
  documents: DocumentSummary[]
}

type FirebaseSource = "current" | "legacy"

interface FirebaseDocumentSummary {
  doc_id: string
  title: string
  author?: string
  chapter_count?: number
  total_chapter_count?: number
  pre2_chapter_count?: number
  created_at?: string
  source: FirebaseSource
}

interface FirebaseDocumentsResponse {
  documents?: FirebaseDocumentSummary[]
  error?: string
}

export default function AdminDocumentsPage() {
  const { t } = useLanguage()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selectedDocument, setSelectedDocument] = useState<NarrativeDocument | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [firebaseSource, setFirebaseSource] = useState<FirebaseSource>("current")
  const [firebaseDocuments, setFirebaseDocuments] = useState<FirebaseDocumentSummary[]>([])
  const [status, setStatus] = useState("")
  const [firebaseStatus, setFirebaseStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [firebaseLoading, setFirebaseLoading] = useState(false)
  const [deletingDocId, setDeletingDocId] = useState("")

  async function loadDocuments() {
    const response = await fetch("/api/documents")
    const data = (await response.json()) as DocumentsResponse
    setDocuments(data.documents)
  }

  async function loadDocument(docId: string) {
    const response = await fetch(`/api/documents?docId=${encodeURIComponent(docId)}`)
    const data = (await response.json()) as { document: NarrativeDocument }
    setSelectedDocument(data.document)
  }

  useEffect(() => {
    loadDocuments().catch(() => setStatus(t("couldNotLoadDocuments")))
  }, [t])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setStatus(t("chooseFile"))
      return
    }

    setLoading(true)
    setStatus(t("uploading"))
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      })
      const data = (await response.json()) as { document?: NarrativeDocument; error?: string }
      if (!response.ok || !data.document) {
        throw new Error(data.error ?? t("uploadFailed"))
      }
      setSelectedDocument(data.document)
      setFile(null)
      setStatus(`Imported ${data.document.title}.`)
      await loadDocuments()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("uploadFailed"))
    } finally {
      setLoading(false)
    }
  }

  async function loadFirebaseDocuments() {
    setFirebaseLoading(true)
    setFirebaseStatus(t("loadingFirebaseDocuments"))

    try {
      const response = await fetch(`/api/firebase/documents?source=${firebaseSource}`)
      const data = (await response.json()) as FirebaseDocumentsResponse
      if (!response.ok || !data.documents) {
        throw new Error(data.error ?? t("firebaseLoadFailed"))
      }
      setFirebaseDocuments(data.documents)
      setFirebaseStatus(t("firebaseDocumentsLoaded", { count: data.documents.length }))
    } catch (error) {
      setFirebaseStatus(error instanceof Error ? error.message : t("firebaseLoadFailed"))
    } finally {
      setFirebaseLoading(false)
    }
  }

  async function importFirebaseDocument(docId: string) {
    setFirebaseLoading(true)
    setFirebaseStatus(t("importingFirebaseDocument"))

    try {
      const response = await fetch("/api/firebase/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: docId, source: firebaseSource }),
      })
      const data = (await response.json()) as { document?: NarrativeDocument; error?: string }
      if (!response.ok || !data.document) {
        throw new Error(data.error ?? t("firebaseImportFailed"))
      }
      setSelectedDocument(data.document)
      setFirebaseStatus(t("firebaseDocumentImported", { title: data.document.title }))
      await loadDocuments()
    } catch (error) {
      setFirebaseStatus(error instanceof Error ? error.message : t("firebaseImportFailed"))
    } finally {
      setFirebaseLoading(false)
    }
  }

  async function deleteDocument(document: DocumentSummary) {
    const confirmed = window.confirm(t("deleteDocumentConfirm", { title: document.title }))

    if (!confirmed) return

    setDeletingDocId(document.doc_id)
    setStatus(t("deletingDocument"))

    try {
      const response = await fetch(`/api/documents?docId=${encodeURIComponent(document.doc_id)}`, {
        method: "DELETE",
      })
      const data = (await response.json()) as { deleted?: unknown; error?: string }

      if (!response.ok || !data.deleted) {
        throw new Error(data.error ?? t("documentDeleteFailed"))
      }

      if (selectedDocument?.doc_id === document.doc_id) {
        setSelectedDocument(null)
      }

      setStatus(t("documentDeleted", { title: document.title }))
      await loadDocuments()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("documentDeleteFailed"))
    } finally {
      setDeletingDocId("")
    }
  }

  return (
    <>
      <div className="topline">
        <div>
          <h1>{t("documentsTitle")}</h1>
          <p className="subtle">{t("documentsSubtitle")}</p>
        </div>
        <button className="button secondary" onClick={() => loadDocuments()} type="button">
          <RefreshCcw size={17} />
          {t("refresh")}
        </button>
      </div>

      <section className="grid two documents-layout">
        <div className="grid">
          <form className="card form-grid" onSubmit={submit}>
            <h2>{t("upload")}</h2>
            <label className="field">
              <span>{t("epubOrTextFile")}</span>
              <input
                className="input"
                type="file"
                accept=".epub,.txt,.md"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button className="button" disabled={loading} type="submit">
              <FileUp size={18} />
              {t("importDocument")}
            </button>
            {status ? <div className="notice">{status}</div> : null}
          </form>

          <div className="card form-grid">
            <h2>{t("firebaseImport")}</h2>
            <p className="subtle">{t("firebaseImportText")}</p>
            <div className="reader-controls">
              <label className="field">
                <span>{t("firebaseSource")}</span>
                <select
                  className="select"
                  value={firebaseSource}
                  onChange={(event) => setFirebaseSource(event.target.value as FirebaseSource)}
                >
                  <option value="current">{t("currentCollection")}</option>
                  <option value="legacy">{t("legacyCollection")}</option>
                </select>
              </label>
              <button
                className="button secondary"
                disabled={firebaseLoading}
                onClick={loadFirebaseDocuments}
                type="button"
              >
                <CloudDownload size={18} />
                {t("loadFirebaseDocuments")}
              </button>
            </div>
            <div className="notice">{t("firebaseCredentialsHint")}</div>
            {firebaseStatus ? <div className="notice">{firebaseStatus}</div> : null}
            {firebaseDocuments.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("title")}</th>
                      <th>{t("pre2ReadyChapters")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {firebaseDocuments.map((document) => (
                      <tr key={document.doc_id}>
                        <td>
                          <strong>{document.title}</strong>
                          <div className="subtle">{document.doc_id}</div>
                        </td>
                        <td>{formatReadyChapters(document)}</td>
                        <td>
                          <button
                            className="button secondary"
                            disabled={firebaseLoading}
                            onClick={() => importFirebaseDocument(document.doc_id)}
                            type="button"
                          >
                            {t("importDocument")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h2>{t("availableDocuments")}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("title")}</th>
                    <th>{t("chapters")}</th>
                    <th>{t("paragraphs")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.doc_id}>
                      <td>
                        <strong>{document.title}</strong>
                        <div className="subtle">{document.doc_id}</div>
                      </td>
                      <td>{document.chapter_count}</td>
                      <td>{document.paragraph_count}</td>
                      <td>
                        <div className="toolbar">
                          <button
                            className="button secondary"
                            onClick={() => loadDocument(document.doc_id)}
                            type="button"
                          >
                            {t("inspect")}
                          </button>
                          <button
                            className="button warning"
                            disabled={deletingDocId === document.doc_id}
                            onClick={() => deleteDocument(document)}
                            type="button"
                          >
                            <Trash2 size={17} />
                            {t("deleteDocument")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="card document-preview-card">
          <h2>{t("chapterPreview")}</h2>
          {selectedDocument ? (
            <div className="grid">
              <div>
                <strong>{selectedDocument.title}</strong>
                <p className="subtle">{selectedDocument.author ?? t("unknownAuthor")}</p>
              </div>
              {selectedDocument.chapters.map((chapter) => (
                <div className="notice" key={chapter.chapter_id}>
                  <strong>
                    {t("chapter")} {chapter.chapter_index}: {chapter.title}
                  </strong>
                  <p className="subtle">
                    {chapter.paragraphs.length} {t("paragraphs").toLowerCase()}
                  </p>
                  <p>{chapter.paragraphs[0]?.text.slice(0, 180)}...</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle">{t("selectDocumentPreview")}</p>
          )}
        </aside>
      </section>
    </>
  )
}

function formatReadyChapters(document: FirebaseDocumentSummary) {
  const ready = document.pre2_chapter_count ?? document.chapter_count
  const total = document.total_chapter_count
  return total && ready !== undefined ? `${ready}/${total}` : ready ?? "-"
}
