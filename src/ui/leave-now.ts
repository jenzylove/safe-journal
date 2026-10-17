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

export function mountLeaveNow(): void {
  if (document.getElementById("leave-now")) return;
  const btn = document.createElement("button");
  btn.id = "leave-now";
  btn.type = "button";
  btn.className = "leave-now";
  btn.textContent = "Leave now";
  btn.addEventListener("click", () => leaveNow());
  document.body.appendChild(btn);

  const pressed = createEscapeTracker(() => Date.now());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pressed()) leaveNow();
  });
}
