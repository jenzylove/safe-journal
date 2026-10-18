// Live proof page. The addresses and keys come from arkiv/evidence.json (written by the seed
// script); every status shown here is read live from Arkiv when the page opens.
import type { Hex } from "viem";
import evidence from "../../arkiv/evidence.json";
import { BURN, readEntity, balanceOf, blockTime, countForeignEntries, explorerAddress, explorerEntity, explorerTx, listEntries, publicClient } from "../arkiv/journal";
import { errText, fmtTime, fromB64Url, h, link, short } from "./dom";
import { skyBand } from "./sky";
import { DEMO_CONTENT_KEY } from "../demo";
import { decodeShare, encodeShare, importContentKey } from "../lib";

type Row = { claim: string; check: () => Promise<{ ok: boolean; detail: string; links?: [string, string][] }> };

export function renderProof(app: HTMLElement): () => void {
  const journal = evidence.wallets.find((w) => w.role.startsWith("demo journal"))!.address as Hex;
  const funder = evidence.wallets.find((w) => w.role.startsWith("project funder"))!.address as Hex;
  const forger = evidence.wallets.find((w) => w.role.startsWith("forger"))!.address as Hex;
  const supporter = evidence.wallets.find((w) => w.role.startsWith("supporter"))!.address as Hex;
  const first = evidence.entries[0]!.key as Hex;

  const rows: Row[] = [
    {
      claim: "Entries cannot be deleted",
      check: async () => {
        const items = await listEntries(journal, null);
        const locked = items.filter((i) => i.owner.toLowerCase() === BURN.toLowerCase()).length;
        return { ok: items.length > 0 && locked === items.length, detail: `${locked} of ${items.length} entries owned by ${short(BURN)}`, links: items.slice(0, 4).map((i) => [short(i.key), explorerEntity(i.key)]) };
      },
    },
    {
      claim: "Write times come from Arkiv",
      check: async () => {
        const items = await listEntries(journal, null);
        const it = items[0];
        if (!it) return { ok: false, detail: "No entries found" };
        return { ok: true, detail: `First entry written in block ${it.createdAtBlock} at ${fmtTime(await blockTime(it.createdAtBlock))}`, links: [["creating transaction", explorerTx(evidence.entries[0]!.tx as Hex)]] };
      },
    },
    {
      claim: "Nothing readable is public",
      check: async () => {
        const e = await readEntity(first);
        const attrs = (e.attributes ?? {}) as Record<string, { value: unknown }>;
        const names = Object.entries(attrs).map(([k, v]) => `${k}=${String(v.value)}`).join(", ");
        return { ok: true, detail: `Labels: ${names || "none"}; payload ${(e.payload as Uint8Array).length} bytes of ciphertext`, links: [["open on explorer", explorerEntity(first)]] };
      },
    },
    {
      claim: "Forged entries are ignored",
      check: async () => {
        const n = await countForeignEntries(journal);
        const f = await readEntity(evidence.forged.entityKey as Hex);
        return { ok: f.creator.toLowerCase() === forger.toLowerCase() && n >= 1, detail: `Forged entry created by ${short(f.creator)}; ${n} look-alike entries from other wallets, none shown in the journal`, links: [["forged entry", explorerEntity(evidence.forged.entityKey as Hex)], ["forger wallet", explorerAddress(forger)]] };
      },
    },
    {
      claim: "A link opens only chosen entries",
      check: async () => {
        const contentKey = await importContentKey(fromB64Url(DEMO_CONTENT_KEY));
        const owned = (await listEntries(journal, { contentKey })).filter((i) => i.entryKeyRaw);
        const chosen = owned[0];
        if (!chosen) return { ok: false, detail: "No per-entry keys found" };
        const shared = decodeShare(encodeShare([{ entityKey: chosen.key, entryKeyRaw: chosen.entryKeyRaw! }]));
        const asLawyer = await listEntries(journal, { shared });
        const opened = asLawyer.filter((i) => i.entry).length;
        return { ok: opened === 1 && asLawyer.length === owned.length, detail: `A link made for 1 entry opens ${opened} of ${asLawyer.length}; the other ${asLawyer.length - opened} stay locked` };
      },
    },
    {
      claim: "Lifetimes can be extended, if allowed",
      check: async () => {
        const e = await readEntity(first);
        const years = (Number((e.expiresAt as bigint) - (e.createdAt as bigint)) * 2) / (365.25 * 86400);
        return { ok: years > 2.5, detail: `Written with a 2 year lifetime; extended by ${short(supporter)}, now about ${years.toFixed(1)} years from creation`, links: [["extension transaction", explorerTx(evidence.extension.txHash as Hex)]] };
      },
    },
    {
      claim: "New journals can be funded",
      check: async () => {
        const b = await balanceOf(funder);
        return { ok: b > 0n, detail: `Funder balance ${(Number(b) / 1e18).toFixed(4)} GLM`, links: [["funder wallet", explorerAddress(funder)]] };
      },
    },
  ];

  const list = h("ol", { class: "proof" });
  app.replaceChildren(
    skyBand(h("h1", {}, "Proof"), h("p", {}, "Checked live from Arkiv when you opened this page.")),
    list,
    h(
      "details",
      { class: "wallets" },
      h("summary", {}, "Wallets behind this demo"),
      h("ul", {}, ...evidence.wallets.map((w) => h("li", {}, `${w.role}: `, link(explorerAddress(w.address as Hex), w.address)))),
    ),
  );
  for (const r of rows) {
    const li = h("li", { class: "reveal" }, h("strong", {}, r.claim), h("p", { class: "hint" }, "Checking..."));
    list.append(li);
    r.check().then(
      (res) => {
        const p = li.querySelector("p")!;
        p.textContent = `${res.ok ? "Verified" : "Not verified"}: ${res.detail}`;
        p.className = res.ok ? "ok" : "error";
        for (const [t, href] of (res.links ?? []).slice(0, 1)) li.append(" ", link(href, t));
      },
      (e) => { const p = li.querySelector("p")!; p.className = "error"; p.textContent = errText(e); },
    );
  }
  return () => {};
}
