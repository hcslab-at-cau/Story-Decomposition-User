import { NextResponse } from "next/server"

import { isStudyResultsEnabled, saveSurveyResponse, saveTaskResponse } from "@/lib/study-results"
import type { StudyResponse } from "@/types/study-results"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isStudyResultsEnabled()) {
    return NextResponse.json({ skipped: true, reason: "Study result storage is disabled." })
  }

  const body = (await request.json()) as {
    kind?: "task" | "survey"
    study_id?: string
    studyId?: string
    participant_id?: string
    participantId?: string
    session_id?: string
    sessionId?: string
    response?: StudyResponse
  }
  const participantId = body.participantId ?? body.participant_id
  const sessionId = body.sessionId ?? body.session_id

  if (!participantId || !sessionId || !body.response) {
    return NextResponse.json({ error: "participantId, sessionId, and response are required." }, { status: 400 })
  }

  const path = {
    studyId: body.studyId ?? body.study_id,
    participantId,
    sessionId,
  }
  const response =
    body.kind === "survey"
      ? await saveSurveyResponse(path, body.response)
      : await saveTaskResponse(path, body.response)

  return NextResponse.json({ response })
}
