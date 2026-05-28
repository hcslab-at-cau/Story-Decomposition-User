import { NextResponse } from "next/server"

import { isStudyResultsEnabled, upsertStudySession } from "@/lib/study-results"
import type { StudyCondition, StudySessionMeta } from "@/types/study-results"

export const runtime = "nodejs"

const VALID_CONDITIONS = new Set<StudyCondition>(["control", "on_demand", "auto_trigger"])

export async function POST(request: Request) {
  if (!isStudyResultsEnabled()) {
    return NextResponse.json({ skipped: true, reason: "Study result storage is disabled." })
  }

  const body = (await request.json()) as Partial<StudySessionMeta> & {
    study_id?: string
    participant_id?: string
    session_id?: string
    book_id?: string
    chapter_id?: string
    task_id?: string
    start_time?: string
    end_time?: string
    assigned_order?: number
    device_info?: StudySessionMeta["deviceInfo"]
  }
  const participantId = body.participantId ?? body.participant_id
  const sessionId = body.sessionId ?? body.session_id
  const bookId = body.bookId ?? body.book_id
  const chapterId = body.chapterId ?? body.chapter_id

  if (!participantId || !sessionId || !bookId || !chapterId) {
    return NextResponse.json(
      { error: "participantId, sessionId, bookId, and chapterId are required." },
      { status: 400 },
    )
  }

  const condition = normalizeCondition(body.condition)
  if (!condition) {
    return NextResponse.json({ error: "Invalid condition." }, { status: 400 })
  }

  const session = await upsertStudySession({
    studyId: body.studyId ?? body.study_id ?? "",
    participantId,
    sessionId,
    condition,
    bookId,
    chapterId,
    taskId: body.taskId ?? body.task_id,
    startTime: body.startTime ?? body.start_time ?? new Date().toISOString(),
    endTime: body.endTime ?? body.end_time,
    deviceInfo: body.deviceInfo ?? body.device_info,
    assignedOrder: body.assignedOrder ?? body.assigned_order,
  })

  return NextResponse.json({ session })
}

function normalizeCondition(condition: unknown): StudyCondition | null {
  if (typeof condition !== "string") return "control"
  return VALID_CONDITIONS.has(condition as StudyCondition) ? (condition as StudyCondition) : null
}
