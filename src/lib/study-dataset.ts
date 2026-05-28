import type { DatasetTaskSummary, NarrativeDocument } from "@/types/document"

interface DatasetTaskSpec {
  task_id: string
  label: string
  title_needles: string[]
  fallback_title_needles?: string[]
  chapter_index: number
  sort_order: number
}

export const STUDY_DATASET_TASKS: DatasetTaskSpec[] = [
  {
    task_id: "alice_ch01",
    label: "이상한 나라의 앨리스 1장",
    title_needles: ["이상한나라의앨리스"],
    fallback_title_needles: ["aliceadventureinwonderland", "alice'sadventureinwonderland"],
    chapter_index: 1,
    sort_order: 1,
  },
  {
    task_id: "alice_ch04",
    label: "이상한 나라의 앨리스 4장",
    title_needles: ["이상한나라의앨리스"],
    fallback_title_needles: ["aliceadventureinwonderland", "alice'sadventureinwonderland"],
    chapter_index: 4,
    sort_order: 2,
  },
  {
    task_id: "alice_ch08",
    label: "이상한 나라의 앨리스 8장",
    title_needles: ["이상한나라의앨리스"],
    fallback_title_needles: ["aliceadventureinwonderland", "alice'sadventureinwonderland"],
    chapter_index: 8,
    sort_order: 3,
  },
  {
    task_id: "oz_ch03",
    label: "오즈의 마법사 3장",
    title_needles: ["오즈의마법사"],
    fallback_title_needles: ["wonderfulwizardofoz", "wizardofoz"],
    chapter_index: 3,
    sort_order: 4,
  },
  {
    task_id: "oz_ch11",
    label: "오즈의 마법사 11장",
    title_needles: ["오즈의마법사"],
    fallback_title_needles: ["wonderfulwizardofoz", "wizardofoz"],
    chapter_index: 11,
    sort_order: 5,
  },
  {
    task_id: "dongbaek_ch01",
    label: "동백꽃",
    title_needles: ["동백꽃"],
    chapter_index: 1,
    sort_order: 6,
  },
  {
    task_id: "bombom_ch01",
    label: "봄봄",
    title_needles: ["봄봄"],
    chapter_index: 1,
    sort_order: 7,
  },
  {
    task_id: "manmubang_ch01",
    label: "만무방",
    title_needles: ["만무방"],
    chapter_index: 1,
    sort_order: 8,
  },
]

export function buildDatasetTaskSummaries(documents: NarrativeDocument[]): DatasetTaskSummary[] {
  return STUDY_DATASET_TASKS.flatMap((spec) => {
    const document = findDocumentForSpec(documents, spec)
    const chapter = document?.chapters.find((item) => item.chapter_index === spec.chapter_index)

    if (!document || !chapter) {
      return []
    }

    return [
      {
        task_id: spec.task_id,
        doc_id: document.doc_id,
        chapter_id: chapter.chapter_id,
        label: spec.label,
        document_title: document.title,
        chapter_title: chapter.title,
        paragraph_count: chapter.paragraphs.length,
        sort_order: spec.sort_order,
      },
    ]
  }).sort((left, right) => left.sort_order - right.sort_order)
}

function findDocumentForSpec(documents: NarrativeDocument[], spec: DatasetTaskSpec) {
  return findDocumentByNeedles(documents, spec.title_needles) ??
    findDocumentByNeedles(documents, spec.fallback_title_needles ?? [])
}

function findDocumentByNeedles(documents: NarrativeDocument[], needles: string[]) {
  if (needles.length === 0) return undefined
  const normalizedNeedles = needles.map(normalizeSearchText)

  return documents.find((document) => {
    const haystack = normalizeSearchText(document.title)
    return normalizedNeedles.some((needle) => haystack.includes(needle))
  })
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s_'’"“”\-.,:;!?()[\]{}]/g, "")
}
