/**
 * Basic content moderation placeholder.
 *
 * This is intentionally a lightweight, rule-based gate that runs before any
 * script is sent to a video provider. Replace or augment `moderateScript`
 * with a real moderation API (e.g. a classification model) before scaling.
 */

export interface ModerationResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * Phrases that indicate the script is trying to pass the avatar off as a
 * specific real person or an official source. Avatar videos must not be
 * used for impersonation.
 */
const IMPERSONATION_PATTERNS: RegExp[] = [
  /\bthis is (?:the )?real\b/i,
  /\bi am (?:the )?(?:real|actual|official)\b/i,
  /\bofficial (?:statement|announcement|message) (?:from|by)\b/i,
  /\bspeaking on behalf of\b/i,
  /\bpretend(?:ing)? to be\b/i,
  /\bimpersonat(?:e|ing|ion)\b/i,
  /\bdeepfake\b/i,
];

export function moderateScript(script: string): ModerationResult {
  const trimmed = script.trim();

  if (!trimmed) {
    return { allowed: false, reason: "Script is empty." };
  }

  for (const pattern of IMPERSONATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason:
          "Script appears to impersonate a real person or claim to be an official source. " +
          "Avatar videos must clearly be your own content — impersonation is not allowed.",
      };
    }
  }

  // TODO: call a real moderation API here (toxicity, sexual content,
  // violence, election misinformation, etc.) before production launch.

  return { allowed: true, reason: null };
}
