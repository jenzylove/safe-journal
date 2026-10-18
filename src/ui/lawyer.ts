import type { Hex } from "viem";
import { claimsFor, explorerAddress, getOne, listEntries, publicClient, readEntity, watchJournal, type Claim, type JournalItem } from "../arkiv/journal";
import { importContentKey, decodeShare, type Access } from "../lib";
import { DEMO_ADDRESS } from "../demo";
import { errText, fromB64Url, h, link, short } from "./dom";
import { skyBand } from "./sky";
import { releasePhotos, renderEntry, spaced } from "./entry-view";

/** Access passed in memory (the standalone reader does this), so no key ever goes into the address bar. */
export type LawyerAccess = { address: Hex; contentKey?: CryptoKey | null; shared?: Map<string, Uint8Array> };

export function renderLawyer(app: HTMLElement, given?: LawyerAccess): () => void {
  let a = "";
  let k: string | null = null;
  let shareParam: string | null = null;
  if (given) {
    a = given.address;
  } else {
    const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
    a = q.get("a") ?? "";
    k = q.get("k");
    shareParam = q.get("s");
    // Keep the key only in memory: take it out of the address bar (and so out of browser history).
    if (k || shareParam) history.replaceState(null, "", `${location.pathname}#/lawyer?a=${a}`);
  }
  const isDemo = a.toLowerCase() === DEMO_ADDRESS.toLowerCase();
  app.replaceChildren(skyBand(h("h1", {}, isDemo ? "Demo journal" : "Shared journal")));
  if (isDemo) app.append(h("p", { class: "demo-note" }, "This is exactly what a lawyer sees when you share entries. Every entry here is synthetic."));
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
    app.append(h("p", { class: "error" }, "This link is not complete. Ask for the link again."));
    return () => {};
  }
  const address = a as Hex;
  let stopped = false;
  let stopWatch: (() => void) | undefined;

  const status = h("p", { role: "status" }, "Reading the journal from Arkiv...");
  const count = h("span", {}, `Journal ${short(address)}`);
  const liveText = h("span", {}, "Live");
  const live = h("span", { class: "live no-print" }, h("i", { "aria-hidden": "true" }), liveText);
  live.hidden = true;
  const head = h("p", { class: "journal-head" }, count, live);
  const list = h("div", { id: "entries" });
  const claimsBox = h("section", { id: "claims" });
  const print = h("button", { type: "button", class: "no-print" }, "Print");
  print.addEventListener("click", () => window.print());
  app.append(head, status, print, list, claimsBox);

  // What this page can open, and what it has put on screen so far.
  let key: CryptoKey | null = null;
  let shared: Map<string, Uint8Array> | undefined;
  let nowBlock = 0n;
  let shown = 0;
  let withheld = 0;
  let emptyNote: HTMLElement | null = null;
  const seen = new Set<string>();
  const handling = new Set<string>();

  const updateHead = (): void => {
    count.textContent = `Journal ${short(address)}. Entries shared: ${shown}${withheld ? `, plus ${withheld} not shared with you` : ""}`;
  };
  const add = (item: JournalItem): void => {
    const id = item.key.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    emptyNote?.remove();
    emptyNote = null;
    shown++;
    list.append(renderEntry(item, key, nowBlock, true));
    updateHead();
  };

  /** Photos arrive as their own entities, so a locked item only counts when it is an entry. */
  const isEntry = async (entityKey: Hex): Promise<boolean> => {
    const attrs = ((await readEntity(entityKey)).attributes ?? {}) as Record<string, { value: unknown }>;
    return attrs.kind?.value === "entry";
  };

  const watchNew = (access: Access): void => {
    // A link for chosen entries opens only those; any other new entry is counted, not shown.
    const selective = !!shared && !key;
    stopWatch = watchJournal(
      address,
      async (entityKey: Hex) => {
        const id = entityKey.toLowerCase();
        if (stopped || seen.has(id) || handling.has(id)) return;
        handling.add(id);
        try {
          const item = await getOne(entityKey, access);
          if (stopped || item.creator.toLowerCase() !== address.toLowerCase()) return;
          if (!item.entry && !(await isEntry(entityKey))) return;
          if (!item.entry && selective) {
            seen.add(id);
            withheld++;
            updateHead();
            return;
          }
          nowBlock = await publicClient.getBlockNumber();
          add(item);
        } catch {
          /* not an entry of this journal */
        } finally {
          handling.delete(id);
        }
      },
      () => {
        liveText.textContent = "Paused";
        live.classList.add("off");
      },
    );
    live.hidden = false;
    if (stopped) stopWatch();
  };

  const claimRow = (c: Claim): HTMLElement =>
    h(
      "div",
      { class: "claim" },
      h("p", { class: "claim-by" }, "Written by ", link(explorerAddress(c.creator), short(c.creator)), ` in block #${spaced(c.createdAtBlock)} `, h("span", { class: "status-pill rejected" }, "Rejected")),
      c.text ? h("p", { class: "claim-text" }, `“${c.text}”`) : null,
    );

  (async () => {
    try {
      let keyBad = false;
      if (given) {
        key = given.contentKey ?? null;
        shared = given.shared;
      } else {
        try {
          if (k) key = await importContentKey(fromB64Url(k));
          if (shareParam) shared = decodeShare(fromB64Url(shareParam));
        } catch {
          keyBad = true;
        }
      }
      const access: Access = { contentKey: key, shared };
      nowBlock = await publicClient.getBlockNumber();
      const all = await listEntries(address, access);
      // A selective share shows the chosen entries; the rest are counted, not shown.
      const items = shared && !key ? all.filter((i) => shared!.has(i.key.toLowerCase())) : all;
      withheld = all.length - items.length;
      const shownKeys = new Set(items.map((i) => i.key.toLowerCase()));
      for (const i of all) if (!shownKeys.has(i.key.toLowerCase())) seen.add(i.key.toLowerCase());
      if (stopped) return;
      status.className = keyBad ? "error" : "";
      status.textContent = keyBad ? "The key in this link is not valid. Entries are shown locked." : "";
      if (!items.length) {
        emptyNote = h("p", {}, "No entries found for this journal.");
        list.append(emptyNote);
      }
      items.forEach(add);
      updateHead();
      watchNew(access);
      try {
        const claims = await claimsFor(address);
        if (!stopped && claims.length) {
          claimsBox.append(
            h("h2", {}, "Not from this journal"),
            h("p", {}, "These carry this journal's label but were written by a different wallet, so they are not part of it."),
            ...claims.map(claimRow),
          );
        }
      } catch (e) {
        if (!stopped) claimsBox.append(h("p", { class: "hint" }, errText(e)));
      }
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
