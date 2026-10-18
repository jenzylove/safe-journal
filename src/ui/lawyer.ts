import type { Hex } from "viem";
import { countForeignEntries, listEntries, publicClient } from "../arkiv/journal";
import { importContentKey } from "../lib";
import { errText, fromB64Url, h, short } from "./dom";
import { releasePhotos, renderEntry } from "./entry-view";

export function renderLawyer(app: HTMLElement): () => void {
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const a = q.get("a") ?? "";
  const k = q.get("k");
  app.replaceChildren(h("h1", {}, "Lawyer view"));
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
    app.append(h("p", { class: "error" }, "This link is not complete. Ask for the link again."));
    return () => {};
  }
  const address = a as Hex;
  let stopped = false;
  const status = h("p", { role: "status" }, "Reading the journal from Arkiv...");
  const head = h("p", {}, `Journal ${short(address)}`);
  const list = h("div", { id: "entries" });
  const foreign = h("p", { id: "foreign" });
  const print = h("button", { type: "button", class: "no-print" }, "Print");
  print.addEventListener("click", () => window.print());
  app.append(head, status, print, list, foreign);

  (async () => {
    try {
      let key: CryptoKey | null = null;
      let keyBad = false;
      if (k) {
        try {
          key = await importContentKey(fromB64Url(k));
        } catch {
          keyBad = true;
        }
      }
      const nowBlock = await publicClient.getBlockNumber();
      const items = await listEntries(address, key);
      if (stopped) return;
      status.className = keyBad ? "error" : "";
      status.textContent = keyBad ? "The key in this link is not valid. Entries are shown locked." : "";
      head.textContent = `Journal ${short(address)}. Entries: ${items.length}`;
      if (!items.length) list.append(h("p", {}, "No entries found for this journal."));
      for (const it of items) list.append(renderEntry(it, key, nowBlock, true));
      try {
        const n = await countForeignEntries(address);
        if (!stopped) foreign.textContent = `Entries with the same labels written by other wallets: ${n}, not shown and not part of this journal.`;
      } catch (e) {
        if (!stopped) foreign.textContent = errText(e);
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
    releasePhotos();
  };
}
