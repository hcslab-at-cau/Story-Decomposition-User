import type { SceneSpan } from "@/types/prediction"

import { uniqueSortedNumbers } from "@/lib/ids"

export function boundariesToScenes(pids: number[], boundaries: number[]): SceneSpan[] {
  const sortedPids = uniqueSortedNumbers(pids)
  const validBoundaries = uniqueSortedNumbers(boundaries).filter((pid) => sortedPids.includes(pid))

  if (sortedPids.length === 0) {
    return []
  }

  const starts = [sortedPids[0], ...validBoundaries.filter((pid) => pid !== sortedPids[0])]

  return starts.map((start, index) => {
    const nextStart = starts[index + 1]
    const end =
      nextStart === undefined
        ? sortedPids[sortedPids.length - 1]
        : sortedPids[Math.max(0, sortedPids.indexOf(nextStart) - 1)]

    return {
      scene_id: `scene_${String(index + 1).padStart(2, "0")}`,
      start_pid: start,
      end_pid: end,
    }
  })
}

export function scenesToBoundaries(scenes: SceneSpan[]) {
  return scenes
    .slice(1)
    .map((scene) => scene.start_pid)
    .sort((a, b) => a - b)
}
