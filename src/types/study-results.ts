export type StudyCondition = "control" | "on_demand" | "auto_trigger"

export type ReadingEventType = "scroll" | "page_move" | "idle" | "resume" | "back_scroll" | "boundary_mark" | "boundary_unmark"

export type MoveDirection = "forward" | "backward" | "same" | "unknown"

export type ScaffoldType =
  | "resume_card"
  | "shift_bridge"
  | "situation_snapshot"
  | "scene_image"
  | "keyword"
  | "causal_link"

export type ScaffoldTriggerType = "auto" | "on_demand"

export interface StudyLocation {
  page?: number
  paragraphId?: number
  sentenceId?: string
  sceneId?: string
  subsceneId?: string
}

export interface DeviceInfo {
  userAgent?: string
  language?: string
  platform?: string
  timezone?: string
  viewport?: {
    width: number
    height: number
  }
}

export interface StudySessionMeta {
  studyId: string
  participantId: string
  sessionId: string
  condition: StudyCondition
  bookId: string
  chapterId: string
  taskId?: string
  startTime: string
  endTime?: string
  deviceInfo?: DeviceInfo
  assignedOrder?: number
  createdAt?: string
  updatedAt?: string
}

export interface ReadingEvent {
  eventId?: string
  eventType: ReadingEventType
  timestamp: string
  durationMs?: number
  location?: StudyLocation
  previousLocation?: StudyLocation
  direction?: MoveDirection
}

export interface ScaffoldEvent {
  eventId?: string
  scaffoldType: ScaffoldType
  triggerType: ScaffoldTriggerType
  shownAt: string
  openedAt?: string
  closedAt?: string
  dwellTimeMs?: number
  clickedButton?: string
  location?: StudyLocation
  dismissed?: boolean
  ignored?: boolean
}

export interface StudyResponse {
  responseId?: string
  responseType: string
  submittedAt: string
  payload: Record<string, unknown>
}
