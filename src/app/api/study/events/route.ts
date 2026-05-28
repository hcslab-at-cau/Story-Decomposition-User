import { NextResponse } from "next/server"

import { isStudyResultsEnabled, saveReadingEvents, saveScaffoldEvents } from "@/lib/study-results"
import type { ReadingEvent, ScaffoldEvent } from "@/types/study-results"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isStudyResultsEnabled()) {
    return NextResponse.json({ skipped: true, reason: "Study result storage is disabled." })
  }

  const body = (await request.json()) as {
    study_id?: string
    studyId?: string
    participant_id?: string
    participantId?: string
    session_id?: string
    sessionId?: string
    reading_events?: ReadingEvent[]
    readingEvents?: ReadingEvent[]
    scaffold_events?: ScaffoldEvent[]
    scaffoldEvents?: ScaffoldEvent[]
  }
  const participantId = body.participantId ?? body.participant_id
  const sessionId = body.sessionId ?? body.session_id

  if (!participantId || !sessionId) {
    return NextResponse.json({ error: "participantId and sessionId are required." }, { status: 400 })
  }

  const path = {
    studyId: body.studyId ?? body.study_id,
    participantId,
    sessionId,
  }
  const readingEvents = body.readingEvents ?? body.reading_events ?? []
  const scaffoldEvents = body.scaffoldEvents ?? body.scaffold_events ?? []
  const [readingCount, scaffoldCount] = await Promise.all([
    saveReadingEvents(path, readingEvents),
    saveScaffoldEvents(path, scaffoldEvents),
  ])

  return NextResponse.json({
    saved: {
      readingEvents: readingCount,
      scaffoldEvents: scaffoldCount,
    },
  })
}
