import { getSession } from "../session";
import { h, toB64Url, go } from "./dom";

function linkBox(title: string, url: string, note: string): HTMLElement {
  const field = h("input", { type: "text", readonly: true, value: url, "aria-label": title });
  const msg = h("span", { role: "status" });
  const btn = h("button", { type: "button" }, "Copy link");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      msg.textContent = "Copied.";
    } catch {
      field.select();
      msg.textContent = "Could not copy automatically. The link is selected, copy it by hand.";
    }
  });
  return h("section", {}, h("h2", {}, title), h("p", {}, note), field, h("div", { class: "actions" }, btn, msg));
}

export function renderShare(app: HTMLElement): () => void {
  const s = getSession();
  if (!s) {
    go("#/");
    return () => {};
  }
  const base = `${location.origin}${location.pathname}#/lawyer?a=${s.address}`;
  app.replaceChildren(
    h("h1", {}, "Share with a lawyer"),
    h(
      "p",
      { class: "warn" },
      "Anyone with the full link can read your journal, and this cannot be taken back. Share it only with your lawyer or advocate. Never put it in a group chat.",
    ),
    linkBox(
      "Full link (can read everything)",
      `${base}&k=${toB64Url(s.contentKeyRaw)}`,
      "Your lawyer sees what you wrote, the times you gave and the proof of when each entry was written.",
    ),
    linkBox("Proof only link (no key)", base, "Shows that entries exist and when they were written, without any of the words or photos."),
    h("p", {}, h("a", { href: "#/journal" }, "Back to journal")),
  );
  return () => {};
}
