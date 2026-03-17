export function hashString(value) {
  const raw = String(value || "");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

export function hashDraft(draft) {
  return `draft_${hashString(String(draft || "").trim())}`;
}

export function buildSessionFingerprint(input) {
  return `session_${hashString(
    JSON.stringify({
      userId: input.userId || "",
      preset: input.preset || "pitch",
      coldStartContext: input.coldStartContext || "general",
      personaVersion: input.personaVersion || 0,
      platform: input.context?.platform || "other",
      relationshipType: input.context?.relationshipType || "acquaintance",
      recipientHandle: input.context?.recipientHandle || input.context?.recipientName || "",
      conversationGoalHint: input.context?.conversationGoalHint || "",
      recentMessages: input.context?.recentMessages || [],
      currentConversationSummary: input.context?.currentConversationSummary || input.context?.threadSummary || ""
    })
  )}`;
}

export function buildBranchCacheKey(input) {
  return `${input.sessionFingerprint}:${hashDraft(input.draft)}`;
}
