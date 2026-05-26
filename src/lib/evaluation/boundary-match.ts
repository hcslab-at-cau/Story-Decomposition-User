import type { BoundaryMatchResult, BoundaryMetrics } from "@/types/evaluation"

import { uniqueSortedNumbers } from "@/lib/ids"

export function matchBoundaries(pred: number[], gold: number[], tolerance: number): BoundaryMatchResult {
  const sortedPred = uniqueSortedNumbers(pred)
  const unmatchedGold = new Set(uniqueSortedNumbers(gold))
  const matches = []
  const falsePositives = []

  for (const predictedPid of sortedPred) {
    const candidates = Array.from(unmatchedGold)
      .filter((goldPid) => Math.abs(predictedPid - goldPid) <= tolerance)
      .sort((a, b) => {
        const distanceDelta = Math.abs(predictedPid - a) - Math.abs(predictedPid - b)
        return distanceDelta === 0 ? a - b : distanceDelta
      })

    const goldPid = candidates[0]
    if (goldPid === undefined) {
      falsePositives.push(predictedPid)
      continue
    }

    unmatchedGold.delete(goldPid)
    matches.push({
      pred: predictedPid,
      gold: goldPid,
      distance: Math.abs(predictedPid - goldPid),
    })
  }

  return {
    matches,
    falsePositives,
    falseNegatives: Array.from(unmatchedGold).sort((a, b) => a - b),
  }
}

export function boundaryMetrics(pred: number[], gold: number[], tolerance: number): BoundaryMetrics {
  const result = matchBoundaries(pred, gold, tolerance)
  const tp = result.matches.length
  const fp = result.falsePositives.length
  const fn = result.falseNegatives.length
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  return { tolerance, tp, fp, fn, precision, recall, f1 }
}

export function nearestDistances(a: number[], b: number[]) {
  const source = uniqueSortedNumbers(a)
  const target = uniqueSortedNumbers(b)

  if (source.length === 0 || target.length === 0) {
    return []
  }

  return source.map((pid) => Math.min(...target.map((targetPid) => Math.abs(pid - targetPid))))
}

export function mean(values: number[]) {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) {
    return sorted[middle]
  }

  return (sorted[middle - 1] + sorted[middle]) / 2
}
