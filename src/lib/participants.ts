export function isTestParticipantId(participantId: string) {
  return participantId.toLowerCase().startsWith("test")
}
