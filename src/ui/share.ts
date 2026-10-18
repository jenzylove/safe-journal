import { listEntries, type JournalItem } from "../arkiv/journal";
import { encodeShare } from "../lib";
import { getSession } from "../session";
import { CATEGORY_LABELS, errText, fmtTime, h, toB64Url, go } from "./dom";

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
  return h("section", { class: "share-link" }, h("h2", {}, title), h("p", {}, note), field, h("div", { class: "actions" }, btn, msg));
}

export function renderShare(app: HTMLElement): () => void {
  const s = getSession();
  if (!s) {
    go("#/");
    return () => {};
  }
  const base = `${location.origin}${location.pathname}#/lawyer?a=${s.address}`;
  const status = h("p", { role: "status" }, "Reading your entries...");
  const choices = h("div", { class: "choices" });
  const out = h("div", { id: "share-out" });
  const make = h("button", { type: "button", id: "make-share" }, "Make a link for the chosen entries");
  let items: JournalItem[] = [];

  make.addEventListener("click", () => {
    const picked = items.filter((it) => (choices.querySelector(`input[value="${it.key}"]`) as HTMLInputElement | null)?.checked && it.entryKeyRaw);
    if (!picked.length) {
      out.replaceChildren(h("p", { class: "error" }, "Choose at least one entry first."));
      return;
    }
    const bundle = encodeShare(picked.map((it) => ({ entityKey: it.key, entryKeyRaw: it.entryKeyRaw! })));
    out.replaceChildren(
      linkBox(
        `Link for ${picked.length} ${picked.length === 1 ? "entry" : "entries"}`,
        `${base}&s=${toB64Url(bundle)}`,
        "Opens only these entries, with their proven times. Your other entries stay closed to whoever has this link.",
      ),
    );
  });

  app.replaceChildren(
    h("h1", {}, "Share with a lawyer"),
    h("p", {}, "Choose what to share. A link opens only the entries you pick, so you never have to hand over the whole journal."),
    h("p", { class: "warn" }, "Whoever has a link can read what it opens. Send it only to your lawyer or advocate, never to a group chat."),
    status,
    choices,
    h("div", { class: "actions" }, make),
    out,
    h("details", {}, h("summary", {}, "Other kinds of link"),
      linkBox("Whole journal", `${base}&k=${toB64Url(s.contentKeyRaw)}`, "Opens every entry, including ones you write later. Use this only with someone you trust completely."),
      linkBox("Proof only", base, "Shows that your entries exist and when each was written, without any words or photos."),
    ),
    h("p", {}, h("a", { href: "#/journal" }, "Back to journal")),
  );

  listEntries(s.address, { contentKey: s.contentKey }).then(
    (list) => {
      items = list.filter((it) => it.entry);
      status.textContent = items.length ? "" : "You have no entries to share yet.";
      make.hidden = !items.length;
      for (const it of items) {
        const id = `pick-${it.key.slice(2, 10)}`;
        const label = `${CATEGORY_LABELS[it.entry!.category] ?? it.entry!.category}, ${fmtTime(new Date(it.entry!.happenedAt))}: ${it.entry!.text.slice(0, 60)}${it.entry!.text.length > 60 ? "..." : ""}`;
        choices.append(h("label", { class: "choice", for: id }, h("input", { type: "checkbox", id, value: it.key }), " ", label));
      }
    },
    (e) => {
      status.className = "error";
      status.textContent = errText(e);
    },
  );
  return () => {};
}
