import type { Chapter } from "@/types/document"

export interface SentenceUnit {
  id: string
  pid: number
  sentence_index: number
  global_index: number
  text: string
}

export function chapterToSentences(chapter: Chapter | null): SentenceUnit[] {
  if (!chapter) {
    return []
  }

  const sentenceUnits: SentenceUnit[] = []

  for (const paragraph of chapter.paragraphs) {
    splitSentences(paragraph.text).forEach((sentence, index) => {
      sentenceUnits.push({
        id: `${paragraph.pid}:${index + 1}`,
        pid: paragraph.pid,
        sentence_index: index + 1,
        global_index: sentenceUnits.length + 1,
        text: sentence,
      })
    })
  }

  return sentenceUnits
}

export function firstSentenceIdForPid(sentences: SentenceUnit[], pid: number) {
  return sentences.find((sentence) => sentence.pid === pid)?.id
}

function splitSentences(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return []
  }

  const matches = normalized.match(/[^.!?。！？…]+[.!?。！？…]+["'”’)]*|[^.!?。！？…]+$/g)
  return (matches ?? [normalized]).map((sentence) => sentence.trim()).filter(Boolean)
}
