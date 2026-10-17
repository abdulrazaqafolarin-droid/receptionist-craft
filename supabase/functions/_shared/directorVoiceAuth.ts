/** Director voice currently uses a single owner's private ElevenLabs vault key. */
export function isDirectorVoiceOwner(callerUserId: string | null, ownerUserId: string): boolean {
  return typeof callerUserId === "string" && callerUserId.length > 0 && callerUserId === ownerUserId;
}
