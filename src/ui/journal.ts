import { leaveNow } from "./leave-now";
import type { Hex } from "viem";
import { getOne, listEntries, publicClient, watchJournal, type JournalItem } from "../arkiv/journal";
import { clearSession, getSession } from "../session";
import { errText, h, go } from "./dom";
import { skyBand } from "./sky";
import { releasePhotos, renderEntry } from "./entry-view";

export function renderJournal(app: HTMLElement): () => void {
  const s = getSession();
  if (!s) {
    go("#/open");
    return () => {};
  }
  let stopped = false;
  let stopWatch: (() => void) | undefined;
  const seen = new Set<string>();

  const list = h("div", { id: "entries" });
  const status = h("p", { id: "journal-status", role: "status" }, "Reading your journal...");
  const empty = h("div", { id: "empty" }, h("p", {}, "No entries yet."), h("a", { href: "#/write", class: "button" }, "Write an entry"));
  empty.hidden = true;

  const close = h("button", { type: "button" }, "Close journal");
  close.addEventListener("click", () => {
    clearSession();
    document.getElementById("app")?.replaceChildren();
    leaveNow();
  });

  app.replaceChildren(
    skyBand(h("h1", {}, "Journal")),
    h(
      "div",
      { class: "actions no-print" },
      h("a", { href: "#/write", class: "button" }, "Write an entry"),
      h("a", { href: "#/share", class: "button" }, "Share with a lawyer"),
      close,
    ),
    h("p", { class: "quiet-link no-print" }, h("a", { href: "#/decoy" }, "Set up an everyday journal")),
    status,
    empty,
    list,
  );

  let nowBlock = 0n;
  const add = (item: JournalItem): void => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    empty.hidden = true;
    list.append(renderEntry(item, s.contentKey, nowBlock, false));
  };

  (async () => {
    try {
      nowBlock = await publicClient.getBlockNumber();
      const items = await listEntries(s.address, s.contentKey);
      if (stopped) return;
      status.textContent = "";
      items.forEach(add);
      if (!items.length) {
        empty.hidden = false;
        // Every passphrase opens its own journal, so a small typo opens a new, empty one.
        if (!s.fresh) empty.querySelector("p")!.textContent = "No entries found for these words. If you expected entries, close the journal and check each word: one changed word opens a different, empty journal.";
      }
      stopWatch = watchJournal(
        s.address,
        async (key: Hex) => {
          if (seen.has(key)) return;
          try {
            const item = await getOne(key, s.contentKey);
            // Photo parts also arrive here; they cannot be opened as entries, so skip them.
            if (stopped || item.creator.toLowerCase() !== s.address.toLowerCase() || !item.entry) return;
            nowBlock = await publicClient.getBlockNumber();
            add(item);
          } catch {
            /* not an entry of ours */
          }
        },
        () => {
          status.textContent = "Live updates paused. Reload the page to see new entries.";
        },
      );
      if (stopped) stopWatch();
    } catch (e) {
      if (!stopped) {
        status.className = "error";
        status.textContent = errText(e);
      }
    }
  })();

  return () => {
    stopped = true;
    stopWatch?.();
    releasePhotos();
  };
}
