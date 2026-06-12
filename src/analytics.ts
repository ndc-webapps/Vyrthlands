// StatsPilot analytics (https://statspilot.vercel.app).
//
// The project id is read at runtime from the Vite env var VITE_STATSPILOT_ID so
// it is not hardcoded and stays per-deployment configurable. When the var is
// unset/empty we do nothing — no script, no errors, no console spam.

declare global {
  interface Window {
    statspilot?: { track?: (name: string, metadata?: unknown) => void };
  }
}

const SCRIPT_SRC = 'https://statspilot.vercel.app/script.js';
let injected = false;

/**
 * Inject the StatsPilot tracking script if VITE_STATSPILOT_ID is configured.
 * Safe to call more than once — only the first call injects the tag. The script
 * sends a pageview on load and exposes window.statspilot.track for custom events.
 */
export function initAnalytics(): void {
  if (injected) return;
  const projectId = (import.meta.env.VITE_STATSPILOT_ID ?? '').trim();
  if (!projectId) return; // analytics disabled
  injected = true;

  const script = document.createElement('script');
  script.defer = true;
  script.src = SCRIPT_SRC;
  script.setAttribute('data-project-id', projectId);
  document.head.appendChild(script);
}

/**
 * Record a custom event. No-op (and never throws) when analytics is disabled or
 * the StatsPilot script hasn't loaded yet.
 */
export function trackEvent(name: string, metadata?: Record<string, unknown>): void {
  try {
    window.statspilot?.track?.(name, metadata);
  } catch {
    /* analytics must never break the game */
  }
}
