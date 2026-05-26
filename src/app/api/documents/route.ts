import { writeFile } from "node:fs/promises"

import { NextResponse } from "next/server"

import {
  deleteDocumentBundle,
  ensureDataDirs,
  getDocument,
  listDocuments,
  saveDocument,
  uploadPath,
} from "@/lib/data/fs-store"
import { epubToDocument, textToDocument } from "@/lib/epub"
import type { NarrativeDocument } from "@/types/document"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const docId = url.searchParams.get("docId")

  if (docId) {
    const document = await getDocument(docId)
    return document
      ? NextResponse.json({ document })
      : NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  const documents = (await listDocuments()).sort((left, right) => {
    const leftSeed = left.source_file === "seed"
    const rightSeed = right.source_file === "seed"
    if (leftSeed !== rightSeed) return leftSeed ? 1 : -1
    return left.title.localeCompare(right.title)
  })
  return NextResponse.json({
    documents: documents.map((document) => ({
      doc_id: document.doc_id,
      title: document.title,
      author: document.author,
      chapter_count: document.chapters.length,
      paragraph_count: document.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0),
      created_at: document.created_at,
    })),
  })
}

export async function POST(request: Request) {
  await ensureDataDirs()
  const contentType = request.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { document?: NarrativeDocument }
    if (!body.document) {
      return NextResponse.json({ error: "Missing document payload" }, { status: 400 })
    }
    await saveDocument(body.document)
    return NextResponse.json({ document: body.document })
  }

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(uploadPath(file.name), buffer)

  const lowerName = file.name.toLowerCase()
  const document = lowerName.endsWith(".epub")
    ? await epubToDocument(file.name, buffer)
    : textToDocument(file.name, buffer.toString("utf8"))

  await saveDocument(document)
  return NextResponse.json({ document })
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const docId = url.searchParams.get("docId")?.trim() ?? ""

  if (!docId) {
    return NextResponse.json({ error: "docId is required" }, { status: 400 })
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(docId)) {
    return NextResponse.json({ error: "Invalid docId" }, { status: 400 })
  }

  const deleted = await deleteDocumentBundle(docId)

  if (!deleted) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  return NextResponse.json({ deleted })
}
