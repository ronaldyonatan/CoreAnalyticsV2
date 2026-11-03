const AUTO_RUN_KEY = "ca:executive-briefing:auto-run";

export interface ExecutiveBriefingAutoRunRequest {
  requestedAt: number;
  source: "voice" | "manual" | "system";
}

/**
 * Call this BEFORE navigating to /executive-briefing from the voice registry.
 */
export function queueExecutiveBriefingAutoRun(
  source: ExecutiveBriefingAutoRunRequest["source"] = "voice"
): void {
  if (typeof window === "undefined") return;

  const request: ExecutiveBriefingAutoRunRequest = {
    requestedAt: Date.now(),
    source,
  };

  window.sessionStorage.setItem(AUTO_RUN_KEY, JSON.stringify(request));
}

/**
 * Read the pending request without removing it.
 * This is intentionally non-destructive because React StrictMode can mount,
 * run an effect, clean it up, and mount again in development. Removing the
 * request on the first probe can otherwise lose the auto-run before it starts.
 */
export function peekExecutiveBriefingAutoRun(
  maxAgeMs = 30_000
): ExecutiveBriefingAutoRunRequest | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(AUTO_RUN_KEY);
  if (!raw) return null;

  try {
    const request = JSON.parse(raw) as ExecutiveBriefingAutoRunRequest;

    if (
      !request?.requestedAt ||
      Date.now() - request.requestedAt > maxAgeMs
    ) {
      window.sessionStorage.removeItem(AUTO_RUN_KEY);
      return null;
    }

    return request;
  } catch {
    window.sessionStorage.removeItem(AUTO_RUN_KEY);
    return null;
  }
}

/** Clear only after ExecutiveBriefing is actually ready to start. */
export function clearExecutiveBriefingAutoRun(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(AUTO_RUN_KEY);
}

/**
 * Backward-compatible destructive consume for any older callers.
 * New ExecutiveBriefing code should use peek + clear.
 */
export function consumeExecutiveBriefingAutoRun(
  maxAgeMs = 30_000
): ExecutiveBriefingAutoRunRequest | null {
  const request = peekExecutiveBriefingAutoRun(maxAgeMs);
  if (request) clearExecutiveBriefingAutoRun();
  return request;
}
