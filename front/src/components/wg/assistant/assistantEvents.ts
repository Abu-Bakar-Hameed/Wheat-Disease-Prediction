/**
 * Cross-component events for the built-in AI assistant launcher.
 *
 * The "+" header button dispatches `ASSISTANT_LAUNCH_EVENT`; the
 * `AssistantLauncher` mounted once in the dashboard shell listens and toggles
 * the floating chat panel. Kept dependency-free so any client component can
 * import it without pulling in the panel itself.
 */

export const ASSISTANT_LAUNCH_EVENT = "wg:assistant-launch";

/**
 * Fired after the assistant has answered. The notification bell listens and
 * refreshes immediately instead of waiting for its next 60s poll — safe because
 * the server inserts the notification row before the chat response is returned.
 */
export const ASSISTANT_REPLIED_EVENT = "wg:assistant-replied";

/** Ask the assistant launcher (if mounted) to open its chat panel. */
export function openAssistantLauncher(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ASSISTANT_LAUNCH_EVENT));
  }
}

/** Tell in-app surfaces that a fresh assistant notification exists. */
export function emitAssistantReplied(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ASSISTANT_REPLIED_EVENT));
  }
}
