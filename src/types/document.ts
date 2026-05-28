export interface Paragraph {
  pid: number
  text: string
  is_narrative?: boolean
}

export interface Chapter {
  chapter_id: string
  chapter_index: number
  title: string
  paragraphs: Paragraph[]
}

export interface NarrativeDocument {
  doc_id: string
  title: string
  author?: string
  source_file?: string
  created_at: string
  chapters: Chapter[]
}

export interface DocumentSummary {
  doc_id: string
  title: string
  author?: string
  chapter_count: number
  paragraph_count: number
  created_at: string
}

export interface DatasetTaskSummary {
  task_id: string
  doc_id: string
  chapter_id: string
  label: string
  document_title: string
  chapter_title: string
  paragraph_count: number
  sort_order: number
}
