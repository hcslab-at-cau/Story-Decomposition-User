import { NextResponse } from "next/server"

import {
  importFirebaseDocument,
  listFirebaseDocuments,
  parseFirebaseDataSource,
} from "@/lib/firebase-documents"
import { saveDocument } from "@/lib/data/fs-store"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const source = parseFirebaseDataSource(url.searchParams.get("source"))

  try {
    const documents = await listFirebaseDocuments(source)
    return NextResponse.json({ documents })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { doc_id?: string; source?: string }
  const source = parseFirebaseDataSource(body.source)

  if (!body.doc_id) {
    return NextResponse.json({ error: "doc_id is required" }, { status: 400 })
  }

  try {
    const document = await importFirebaseDocument(body.doc_id, source)
    await saveDocument(document)
    return NextResponse.json({ document })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
