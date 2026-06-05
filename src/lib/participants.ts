export function isTestParticipantId(participantId: string) {
  return participantId.toLowerCase().startsWith("test")
}

interface StudyParticipantCandidate {
  id: string
  role?: string
}

export function studyParticipantIds(users: StudyParticipantCandidate[]) {
  return users
    .filter((user) => user.role === "user" && !isTestParticipantId(user.id))
    .map((user) => user.id)
    .sort(compareParticipantIds)
}

export function compareParticipantIds(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true })
}

export function formatParticipantIdRange(participantIds: string[]) {
  const sortedIds = [...participantIds].sort(compareParticipantIds)

  if (sortedIds.length === 0) {
    return null
  }

  if (sortedIds.length === 1) {
    return sortedIds[0]
  }

  const parsedIds = sortedIds.map(parseNumberedParticipantId)

  if (parsedIds.some((parsedId) => parsedId === null)) {
    return null
  }

  const first = parsedIds[0]

  if (!first) {
    return null
  }

  const sameNumberedSeries = parsedIds.every(
    (parsedId, index) =>
      parsedId !== null &&
      parsedId.prefix === first.prefix &&
      parsedId.width === first.width &&
      parsedId.number === first.number + index,
  )

  if (!sameNumberedSeries) {
    return null
  }

  return `${sortedIds[0]}-${sortedIds[sortedIds.length - 1]}`
}

function parseNumberedParticipantId(participantId: string) {
  const match = participantId.match(/^([a-zA-Z]+)(\d+)$/)

  if (!match) {
    return null
  }

  return {
    prefix: match[1],
    number: Number(match[2]),
    width: match[2].length,
  }
}
