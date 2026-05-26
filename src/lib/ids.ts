export function slugifyId(value: string, fallback = "item") {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

  return slug || fallback
}

export function compactId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function uniqueSortedNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value))),
  ).sort((a, b) => a - b)
}
