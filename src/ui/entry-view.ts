import type { Hex } from "viem";
import {
  BURN,
  blockTime,
  creationTx,
  explorerAddress,
  explorerEntity,
  explorerTx,
  loadPhoto,
  type JournalItem,
} from "../arkiv/journal";
import { CATEGORY_LABELS, errText, fmtTime, h, link, short } from "./dom";

const photoUrls = new Set<string>();
/** Frees every picture shown so far. Called when leaving a screen. */
export function releasePhotos(): void {
  for (const u of photoUrls) URL.revokeObjectURL(u);
  photoUrls.clear();
}

function remaining(expires: bigint, now: bigint): string {
  if (expires <= now) return "expired";
  const days = Number(((expires - now) * 2n) / 86400n);
  if (days >= 360) return `about ${(days / 365.25).toFixed(1)} years`;
  if (days >= 60) return `about ${Math.round(days / 30)} months`;
  return `${days} days`;
}

function row(label: string, value: Node | string): HTMLElement {
  return h("div", { class: "row" }, h("dt", {}, label), h("dd", {}, value));
}

const SVG_NS = "http://www.w3.org/2000/svg";
let sealId = 0;

/** The notary's seal: a small ink stamp with the block number in the centre. */
function seal(block: bigint): SVGSVGElement {
  const id = `seal-ring-${sealId++}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "seal");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", "64");
  svg.setAttribute("height", "64");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Proven by Arkiv, block ${block}`);
  const num = `#${block}`;
  const size = num.length > 8 ? 11 : num.length > 6 ? 13 : 15;
  svg.innerHTML =
    `<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3"/>` +
    `<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="1"/>` +
    `<circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" stroke-width="1"/>` +
    `<defs><path id="${id}" d="M50 50 m-32 0 a32 32 0 1 1 64 0 a32 32 0 1 1 -64 0"/></defs>` +
    `<text font-size="9.5" font-weight="700" letter-spacing="2.2" fill="currentColor" class="seal-ring"><textPath href="#${id}" startOffset="0" textLength="196" lengthAdjust="spacing">PROVEN BY ARKIV \u2022 PROVEN BY ARKIV \u2022</textPath></text>` +
    `<text x="50" y="${50 + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="700" fill="currentColor" class="seal-num"></text>`;
  svg.querySelector(".seal-num")!.textContent = num;
  return svg;
}

/** One entry. `full` = lawyer view (proof open, block number, full keys). */
export function renderEntry(item: JournalItem, contentKey: CryptoKey | null, nowBlock: bigint, full: boolean): HTMLElement {
  const art = h("article", { class: "entry" });
  const entry = item.entry;

  art.append(seal(item.createdAtBlock));
  art.append(h("h3", {}, entry ? (CATEGORY_LABELS[entry.category] ?? entry.category) : "Entry"));

  const writtenAt = h("span", {}, "reading the time from Arkiv...");
  art.append(
    h(
      "p",
      { class: "times" },
      entry ? `You said it happened: ${fmtTime(new Date(entry.happenedAt))}` : "",
      entry ? h("br") : null,
      "Written at: ",
      writtenAt,
      " (proven by Arkiv)",
    ),
  );
  blockTime(item.createdAtBlock).then(
    (d) => (writtenAt.textContent = fmtTime(d)),
    (e) => (writtenAt.textContent = errText(e)),
  );

  if (entry) {
    art.append(h("p", { class: "entry-text" }, entry.text));
    if (entry.photo && (item.entryKey ?? contentKey)) {
      const photo = entry.photo;
      const box = h("div", { class: "photo no-print" });
      const btn = h("button", { type: "button" }, "Show photo");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Loading photo...";
        try {
          const blob = await loadPhoto((item.entryKey ?? contentKey)!, photo.parts[0] as Hex, photo.mime);
          const url = URL.createObjectURL(blob);
          photoUrls.add(url);
          btn.replaceWith(h("img", { src: url, alt: "Photo attached to this entry" }));
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Show photo";
          box.append(h("p", { class: "error", role: "alert" }, errText(e)));
        }
      });
      box.append(btn);
      art.append(box);
    }
  } else {
    art.append(
      h("p", { class: "entry-text" }, item.unreadable ? "Not shared with you. Only its proven time is shown." : "Locked (no key)."),
    );
  }

  const details = h("details", { class: "proof" }, h("summary", {}, "Proof details"));
  if (full) details.open = true;
  const dl = h("dl");
  dl.append(row("Entity key", link(explorerEntity(item.key), full ? item.key : short(item.key))));
  if (full) dl.append(row("Block number", item.createdAtBlock.toString()));
  const locked = item.owner.toLowerCase() === BURN.toLowerCase();
  dl.append(row("Owner", locked ? "Burn address, cannot be deleted" : `Not locked. Owner: ${item.owner}`));
  if (full) dl.append(row("Written by", link(explorerAddress(item.creator), item.creator)));
  dl.append(row("Lifetime remaining", remaining(item.expiresAtBlock, nowBlock)));
  if (full) dl.append(row("Expires at block", item.expiresAtBlock.toString()));
  const tx = h("span", {}, "Loading...");
  dl.append(row("Creating transaction", tx));
  let loaded = false;
  const loadTx = () => {
    if (loaded) return;
    loaded = true;
    creationTx(item.key, item.createdAtBlock).then(
      (hash) => tx.replaceChildren(hash ? link(explorerTx(hash), full ? hash : short(hash)) : "Not found"),
      (e) => tx.replaceChildren(errText(e)),
    );
  };
  details.addEventListener("toggle", () => details.open && loadTx());
  if (full) loadTx();
  details.append(dl);
  art.append(details);
  return art;
}
