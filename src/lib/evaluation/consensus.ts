import type { Annotation, ConsensusGold } from "@/types/annotation"

import { uniqueSortedNumbers } from "@/lib/ids"

interface BoundaryVote {
  pid: number
  annotator_id: string
}

export function buildConsensusGold(
  docId: string,
  chapterId: string,
  annotations: Annotation[],
  tolerance = 1,
): ConsensusGold {
  const chapterAnnotations = annotations.filter(
    (annotation) => annotation.doc_id === docId && annotation.chapter_id === chapterId,
  )
  const annotatorCount = new Set(chapterAnnotations.map((annotation) => annotation.annotator_id)).size
  const threshold = Math.max(1, Math.ceil(annotatorCount / 2))
  const votes = chapterAnnotations.flatMap((annotation) =>
    uniqueSortedNumbers(annotation.boundary_before_pids).map((pid) => ({
      pid,
      annotator_id: annotation.annotator_id,
    })),
  )

  const clusters = clusterBoundaryVotes(votes, tolerance)
  const gold_boundaries = []
  const ambiguous_boundaries = []

  for (const cluster of clusters) {
    const uniqueAnnotators = new Set(cluster.map((vote) => vote.annotator_id))
    const clusterVotes = uniqueAnnotators.size
    const pids = cluster.map((vote) => vote.pid)

    if (clusterVotes < threshold) {
      ambiguous_boundaries.push({
        candidate_center_pid: Math.round(pids.reduce((sum, pid) => sum + pid, 0) / pids.length),
        votes: clusterVotes,
        annotator_count: annotatorCount,
        annotator_pids: pids,
        reason: "below_majority" as const,
      })
      continue
    }

    const selectedPid = selectConsensusPid(pids)
    gold_boundaries.push({
      boundary_before_pid: selectedPid,
      votes: clusterVotes,
      annotator_count: annotatorCount,
      annotator_pids: pids,
      confidence: confidenceLabel(clusterVotes, annotatorCount),
      position_confidence: positionConfidence(pids, selectedPid),
    })
  }

  return {
    doc_id: docId,
    chapter_id: chapterId,
    annotator_count: annotatorCount,
    tolerance_for_clustering: tolerance,
    gold_boundaries: gold_boundaries.sort((a, b) => a.boundary_before_pid - b.boundary_before_pid),
    ambiguous_boundaries,
    created_at: new Date().toISOString(),
  }
}

function clusterBoundaryVotes(votes: BoundaryVote[], tolerance: number) {
  const sorted = [...votes].sort((a, b) => a.pid - b.pid)
  const clusters: BoundaryVote[][] = []
  const maxWidth = tolerance * 2

  for (const vote of sorted) {
    const current = clusters[clusters.length - 1]
    if (!current) {
      clusters.push([vote])
      continue
    }

    const minPid = Math.min(...current.map((item) => item.pid))
    const maxPid = Math.max(...current.map((item) => item.pid), vote.pid)

    if (maxPid - minPid <= maxWidth) {
      current.push(vote)
    } else {
      clusters.push([vote])
    }
  }

  return clusters
}

function selectConsensusPid(pids: number[]) {
  const counts = new Map<number, number>()
  for (const pid of pids) {
    counts.set(pid, (counts.get(pid) ?? 0) + 1)
  }

  const sortedCounts = Array.from(counts).sort((a, b) => {
    const countDelta = b[1] - a[1]
    return countDelta === 0 ? a[0] - b[0] : countDelta
  })

  if (sortedCounts.length > 1 && sortedCounts[0][1] === sortedCounts[1][1]) {
    return medianPid(pids)
  }

  return sortedCounts[0][0]
}

function medianPid(pids: number[]) {
  const sorted = [...pids].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : sorted[middle - 1]
}

function confidenceLabel(votes: number, annotatorCount: number) {
  if (votes === annotatorCount) {
    return "unanimous" as const
  }
  if (votes === annotatorCount - 1) {
    return "strong" as const
  }
  return "majority" as const
}

function positionConfidence(pids: number[], selectedPid: number) {
  const uniquePids = new Set(pids)
  const selectedVotes = pids.filter((pid) => pid === selectedPid).length

  if (uniquePids.size === 1) {
    return "high" as const
  }
  if (selectedVotes > pids.length / 2) {
    return "medium" as const
  }
  return "low" as const
}
