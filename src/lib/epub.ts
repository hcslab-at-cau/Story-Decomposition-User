import * as cheerio from "cheerio"
import JSZip from "jszip"

import type { Chapter, NarrativeDocument, Paragraph } from "@/types/document"

import { slugifyId } from "@/lib/ids"

export async function epubToDocument(fileName: string, buffer: Buffer): Promise<NarrativeDocument> {
  const zip = await JSZip.loadAsync(buffer)
  const opfFile = findOpfFile(zip)
  const metadata: { title?: string; author?: string } = opfFile ? await readMetadata(zip, opfFile) : {}
  const htmlFiles = Object.keys(zip.files)
    .filter((name) => /\.(xhtml|html?)$/i.test(name))
    .filter((name) => !/(nav|toc|cover|titlepage)\.(xhtml|html?)$/i.test(name))
    .sort((a, b) => a.localeCompare(b))

  const chapters: Chapter[] = []
  let globalPid = 1

  for (const [index, htmlFile] of htmlFiles.entries()) {
    const html = await zip.files[htmlFile].async("text")
    const chapter = htmlToChapter(html, htmlFile, index + 1, globalPid)

    if (chapter.paragraphs.length === 0) {
      continue
    }

    globalPid += chapter.paragraphs.length
    chapters.push(chapter)
  }

  if (chapters.length === 0) {
    throw new Error("No readable paragraph content was found in this EPUB.")
  }

  const title = metadata.title ?? stripExtension(fileName)

  return {
    doc_id: uniqueDocId(title),
    title,
    author: metadata.author,
    source_file: fileName,
    created_at: new Date().toISOString(),
    chapters,
  }
}

export function textToDocument(fileName: string, text: string): NarrativeDocument {
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map<Paragraph>((paragraph, index) => ({
      pid: index + 1,
      text: paragraph,
    }))

  if (paragraphs.length === 0) {
    throw new Error("No paragraph content was found in this text file.")
  }

  const title = stripExtension(fileName)

  return {
    doc_id: uniqueDocId(title),
    title,
    source_file: fileName,
    created_at: new Date().toISOString(),
    chapters: [
      {
        chapter_id: "ch01",
        chapter_index: 1,
        title,
        paragraphs,
      },
    ],
  }
}

function htmlToChapter(html: string, fileName: string, chapterIndex: number, firstPid: number): Chapter {
  const $ = cheerio.load(html)
  $("script, style, nav").remove()

  const title =
    $("h1").first().text().trim() ||
    $("h2").first().text().trim() ||
    $("title").first().text().trim() ||
    stripExtension(fileName.split(/[\\/]/).pop() ?? fileName)

  const paragraphs = $("p")
    .toArray()
    .map((element) => $(element).text().replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0)
    .map<Paragraph>((text, index) => ({
      pid: firstPid + index,
      text,
    }))

  return {
    chapter_id: `ch${String(chapterIndex).padStart(2, "0")}`,
    chapter_index: chapterIndex,
    title,
    paragraphs,
  }
}

function findOpfFile(zip: JSZip) {
  return Object.keys(zip.files).find((name) => /\.opf$/i.test(name))
}

async function readMetadata(zip: JSZip, opfFile: string) {
  const raw = await zip.files[opfFile].async("text")
  const $ = cheerio.load(raw, { xmlMode: true })
  const title = $("dc\\:title, title").first().text().trim()
  const author = $("dc\\:creator, creator").first().text().trim()

  return {
    title: title || undefined,
    author: author || undefined,
  }
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
}

function uniqueDocId(title: string) {
  return `${slugifyId(title, "document")}-${Date.now().toString(36)}`
}
