// Live proof page. The addresses and keys come from arkiv/evidence.json (written by the seed
// script); every status shown here is read live from Arkiv when the page opens.
import type { Hex } from "viem";
import evidence from "../../arkiv/evidence.json";
import { BURN, BLOCKS_PER_YEAR, readEntity, balanceOf, blockTime, claimsFor, creationTx, explorerAddress, explorerEntity, explorerTx, listEntries, publicClient } from "../arkiv/journal";
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
      claim: "Entries cannot be deleted or changed",
      check: async () => {
        const items = await listEntries(journal, null);
        const locked = items.filter((i) => i.owner.toLowerCase() === BURN.toLowerCase()).length;
        const ro = await Promise.all(items.map((i) => readEntity(i.key).then((e) => (e.creationFlags as { readonly: boolean }).readonly)));
        const readonly = ro.filter(Boolean).length;
        return { ok: items.length > 0 && locked === items.length && readonly === items.length, detail: `${locked} of ${items.length} entries owned by ${short(BURN)}, ${readonly} of ${items.length} created readonly`, links: items.slice(0, 1).map((i) => [short(i.key), explorerEntity(i.key)]) };
      },
    },
    {
      claim: "Write times come from Arkiv",
      check: async () => {
        const items = await listEntries(journal, null);
        const it = items.find((i) => i.key.toLowerCase() === first.toLowerCase());
        if (!it) return { ok: false, detail: "Demo entry not found" };
        const tx = await creationTx(it.key, it.createdAtBlock);
        const when = await blockTime(it.createdAtBlock);
        const matches = tx?.toLowerCase() === String(evidence.entries[0]!.tx).toLowerCase();
        return { ok: matches, detail: matches ? `Created in block ${it.createdAtBlock} at ${fmtTime(when)}, by the transaction recorded when it was written` : "The creating transaction does not match the record", links: [["creating transaction", explorerTx(evidence.entries[0]!.tx as Hex)]] };
      },
    },
    {
      claim: "Nothing readable is public",
      check: async () => {
        const e = await readEntity(first);
        const attrs = (e.attributes ?? {}) as Record<string, { value: unknown }>;
        const names = Object.keys(attrs).sort();
        const allowed = ["app", "journal", "kind", "v"];
        const payload = e.payload as Uint8Array;
        // format 2: 1 + 12 + 48 wrapped key, then 1 + 12 + padded body + 16 tag
        const body = payload.length - (1 + 12 + 48) - (1 + 12 + 16);
        const padded = [1024, 2048, 4096, 8192, 16384, 32768, 65536].includes(body);
        const ok = names.every((n) => allowed.includes(n)) && payload[0] === 2 && padded;
        return { ok, detail: `Public labels: ${names.join(", ")}. Contents: ${payload.length} bytes of ciphertext padded to ${body} bytes`, links: [["open on explorer", explorerEntity(first)]] };
      },
    },
    {
      claim: "Planted entries are rejected",
      check: async () => {
        const [claims, items] = await Promise.all([claimsFor(journal), listEntries(journal, null)]);
        const planted = claims.find((c) => c.key.toLowerCase() === String(evidence.forged.entityKey).toLowerCase());
        const leaked = items.some((i) => i.key.toLowerCase() === String(evidence.forged.entityKey).toLowerCase());
        return { ok: !!planted && planted.creator.toLowerCase() === forger.toLowerCase() && !leaked, detail: planted ? `An entry labelled as this journal's, written by ${short(planted.creator)}, is shown as rejected and never enters the journal` : "Planted entry not found", links: [["planted entry", explorerEntity(evidence.forged.entityKey as Hex)]] };
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
        const [e, tx] = await Promise.all([readEntity(first), publicClient.getTransaction({ hash: evidence.extension.txHash as Hex })]);
        const years = Number(((e.expiresAt as bigint) - (e.createdAt as bigint)) * 1000n / BLOCKS_PER_YEAR) / 1000;
        const byOther = tx.from.toLowerCase() === supporter.toLowerCase() && tx.from.toLowerCase() !== journal.toLowerCase();
        const fixed = (evidence.entries as { key: string; extendable?: boolean }[]).find((x) => x.extendable === false);
        let fixedOk = true;
        if (fixed) fixedOk = !((await readEntity(fixed.key as Hex)).creationFlags as { permissionlessExtension: boolean }).permissionlessExtension;
        return { ok: byOther && years > 2.5 && fixedOk, detail: `Written for 2 years, kept longer by another wallet (${short(tx.from)}): now about ${years.toFixed(1)} years. An entry written without permission cannot be extended`, links: [["extension transaction", explorerTx(evidence.extension.txHash as Hex)]] };
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
