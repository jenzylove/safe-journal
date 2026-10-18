import { blockTime, listEntries } from "../arkiv/journal";
import { DEMO_ADDRESS } from "../demo";
import { h } from "./dom";
import { cloud } from "./sky";

const THIN = " ";

function accordion(items: Array<[string, string]>): HTMLElement {
  const root = h("div", { class: "acc" });
  const rows: Array<{ row: HTMLElement; btn: HTMLElement; body: HTMLElement }> = [];
  const setOpen = (open: number): void => {
    rows.forEach((r, i) => {
      const on = i === open;
      r.row.classList.toggle("open", on);
      r.btn.setAttribute("aria-expanded", String(on));
      if (on) r.body.removeAttribute("inert");
      else r.body.setAttribute("inert", "");
    });
  };
  items.forEach(([title, text], i) => {
    const n = String(i + 1).padStart(2, "0");
    const btn = h(
      "button",
      { type: "button", class: "acc-head", id: `acc-h${i}`, "aria-expanded": "false", "aria-controls": `acc-b${i}` },
      h("span", { class: "acc-n", "aria-hidden": "true" }, n),
      h("span", { class: "acc-title" }, title),
      h("span", { class: "acc-icon", "aria-hidden": "true" }),
    );
    const body = h(
      "div",
      { class: "acc-body", id: `acc-b${i}`, role: "region", "aria-labelledby": `acc-h${i}` },
      h("div", { class: "acc-clip" }, h("p", {}, text)),
    );
    const row = h("div", { class: "acc-row" }, btn, body);
    btn.addEventListener("click", () => setOpen(row.classList.contains("open") ? -1 : i));
    rows.push({ row, btn, body });
    root.append(row);
  });
  setOpen(0);
  return root;
}
function point(title: string, body: string): HTMLElement {
  return h("div", { class: "point" }, h("p", {}, h("strong", {}, title), " ", body));
}

/** "2 min ago", "3 h ago", "5 days ago". */
function ago(d: Date): string {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export function fmtBlock(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

export function renderLanding(app: HTMLElement): () => void {
  let stopped = false;

  const pillText = h("span", { class: "pill-text" }, "Reading Arkiv...");
  const pill = h(
    "span",
    { class: "sealed", id: "latest-seal", role: "status" },
    h("i", { "aria-hidden": "true" }),
    pillText,
  );

  (async () => {
    try {
      const items = await listEntries(DEMO_ADDRESS, null);
      if (!items.length) throw new Error("none");
      const block = items.reduce((m, i) => (i.createdAtBlock > m ? i.createdAtBlock : m), 0n);
      const when = await blockTime(block);
      if (stopped) return;
      pillText.replaceChildren(
        h("span", { class: "long" }, "Latest demo entry sealed"),
        h("span", { class: "short" }, "Sealed"),
        ` in block #${fmtBlock(block)} · ${ago(when)}`,
      );
    } catch {
      if (!stopped) pill.hidden = true;
    }
  })();

  const hero = h(
    "div",
    { class: "panel-wrap" },
    h(
      "section",
      { class: "panel" },
      cloud("c1", 4),
      cloud("c2", 3),
      h("div", { class: "arc", "aria-hidden": "true" }),
      h(
        "div",
        { class: "inner" },
        h("span", { class: "badge rise d1" }, h("i", { "aria-hidden": "true" }), "Private. Undeletable. Proven by Arkiv."),
        h("h1", { class: "rise d2" }, "Write it down. ", h("br"), "Keep it safe."),
        h(
          "p",
          { class: "sub rise d3" },
          "A private journal for documenting abuse. Nothing is kept on your phone, nobody can delete what you write, and every entry carries proof of when it was written.",
        ),
        h(
          "div",
          { class: "ctas rise d4" },
          h("a", { href: "#/start", class: "button cta" }, "Start my journal"),
          h("a", { href: "#/", class: "button cta alt", "data-scroll": "how" }, "See how it works"),
        ),
      ),
      pill,
    ),
  );

  const ext = h(
    "a",
    { href: "https://github.com/jenzylove/safe-journal/blob/main/arkiv/schema.md", target: "_blank", rel: "noopener noreferrer" },
    "Read the data contract",
  );

  app.replaceChildren(
    hero,
    h(
      "p",
      { class: "quiet-link below-hero" },
      h("a", { href: "#/open" }, "I already have a journal"),
      h("a", { href: "#/demo" }, "See a demo journal"),
    ),
    h("p", { class: "safety-note" }, "Use a private tab. Press Leave now, or Escape three times, to jump straight to the weather."),
    h(
      "section",
      { class: "band reveal", id: "how" },
      h("h2", {}, "How it works"),
      accordion([
        ["Choose six words", "Your journal opens with a passphrase only you know. No account, no email, no phone number."],
        ["Write what happened", "Your words and photos are locked on this device before they leave it. Photos lose their location details."],
        ["Share when you are ready", "Give your lawyer a link that opens only the entries you choose, each with its proof."],
      ]),
    ),
    h(
      "section",
      { class: "band reveal" },
      h("h2", {}, "Why it holds up"),
      point("The time is proven.", "Each entry is stamped with the moment it reached Arkiv, a public record nobody controls. Not your phone's clock, and not ours."),
      point("Nobody can delete it.", "Not you under pressure, not someone holding your phone, not us."),
      point("It outlives this website.", "If this site ever disappears, a single file reader still opens your journal."),
      point("Only you can read it.", "The public record shows locked data: never your words, photos or names. What it does show is set out plainly in our threat model."),
    ),
    h(
      "section",
      { class: "band reveal" },
      h("h2", {}, "If someone makes you open it"),
      h(
        "p",
        {},
        "You can set up a second passphrase that opens an everyday journal of ordinary notes. Your real journal stays closed, and nothing in the journals links them.",
      ),
      h("p", {}, h("a", { href: "#/start" }, "Set one up after you start")),
    ),
    h(
      "section",
      { class: "band reveal" },
      h("h2", {}, "The technology, briefly"),
      h(
        "p",
        {},
        "Safe Journal stores each entry on Arkiv, a database that lives on a blockchain. Every entry is encrypted in your browser, written in one transaction that hands it to an address nobody controls, and kept for exactly as long as you choose: one, two, five or ten years. If you allow it, your lawyer can keep an entry longer.",
      ),
      h("p", { class: "link-row" }, h("a", { href: "#/proof" }, "See the live proof"), ext, h("a", { href: "#/demo" }, "Try the demo journal")),
    ),
    h("section", { class: "final reveal" }, h("a", { href: "#/start", class: "button cta" }, "Start my journal")),
  );
  return () => {
    stopped = true;
  };
}
