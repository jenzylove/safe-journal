export const LEAVE_URL = "https://www.bbc.com/weather";
export const ESCAPE_COUNT = 3;
export const ESCAPE_WINDOW_MS = 1500;

/** Pure Escape tracker. Returns true when the Nth press lands inside the window. */
export function createEscapeTracker(
  now: () => number,
  count = ESCAPE_COUNT,
  windowMs = ESCAPE_WINDOW_MS,
): () => boolean {
  let times: number[] = [];
  return () => {
    const t = now();
    times = times.filter((x) => t - x <= windowMs);
    times.push(t);
    if (times.length >= count) {
      times = [];
      return true;
    }
    return false;
  };
}

export function leaveNow(replace: (url: string) => void = (u) => location.replace(u)): void {
  replace(LEAVE_URL);
}

export function createLeaveButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = "leave-now";
  btn.type = "button";
  btn.className = "leave-now";
  btn.innerHTML =
    '<svg class="leave-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/></svg><span>Leave now</span>';
  btn.addEventListener("click", () => leaveNow());
  return btn;
}

let escapeInstalled = false;
function installEscape(): void {
  if (escapeInstalled) return;
  escapeInstalled = true;
  const pressed = createEscapeTracker(() => Date.now());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pressed()) leaveNow();
  });
}

/** Puts the Leave now button into `host` (the header) and arms the triple Escape. */
export function mountLeaveNow(host: HTMLElement = document.body): HTMLButtonElement {
  const existing = document.getElementById("leave-now") as HTMLButtonElement | null;
  if (existing) return existing;
  const btn = createLeaveButton();
  host.appendChild(btn);
  installEscape();
  return btn;
}
