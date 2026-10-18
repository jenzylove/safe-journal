import { leaveNow } from "./leave-now";
// Auto lock. A journal left open on a phone that someone else picks up is the risk: after two minutes
// out of sight, or fifteen minutes without a touch, the keys are dropped and the page goes home.
// Only timestamps in memory are used; nothing is stored anywhere.
import { clearSession, getSession } from "../session";
import { go } from "./dom";

export const HIDDEN_LIMIT_MS = 2 * 60_000;
export const IDLE_LIMIT_MS = 15 * 60_000;
const TICK_MS = 20_000;

export type LockState = { now: number; hiddenSince: number | null; lastInput: number };

/** Which rule locks the journal now, if any. Pure, so it can be tested without a browser. */
export function lockReason(s: LockState): "hidden" | "idle" | null {
  if (s.hiddenSince !== null && s.now - s.hiddenSince > HIDDEN_LIMIT_MS) return "hidden";
  if (s.now - s.lastInput > IDLE_LIMIT_MS) return "idle";
  return null;
}

export function startAutoLock(): () => void {
  let hiddenSince: number | null = document.visibilityState === "hidden" ? Date.now() : null;
  let lastInput = Date.now();

  const lock = (): void => {
    if (!getSession()) return;
    clearSession();
    hiddenSince = null;
    lastInput = Date.now();
    // Wipe what is on screen at once, then leave for the weather: whoever picks the phone up next
    // should not land on a page that says what this site is.
    document.getElementById("app")?.replaceChildren();
    leaveNow();
  };
  const check = (): void => {
    if (!getSession()) return;
    if (lockReason({ now: Date.now(), hiddenSince, lastInput })) lock();
  };

  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      hiddenSince ??= Date.now();
      return;
    }
    // Back on screen: decide before anything is shown.
    check();
    hiddenSince = null;
  };
  const onInput = (): void => {
    lastInput = Date.now();
  };

  document.addEventListener("visibilitychange", onVisibility);
  const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
  for (const ev of events) window.addEventListener(ev, onInput, { passive: true });
  const timer = window.setInterval(check, TICK_MS);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    for (const ev of events) window.removeEventListener(ev, onInput);
    window.clearInterval(timer);
  };
}
