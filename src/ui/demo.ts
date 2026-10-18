import { DEMO_ADDRESS, DEMO_CONTENT_KEY } from "../demo";
import { h, go } from "./dom";

/**
 * Judge path. The demo journal is synthetic; only its read-only link (address plus content key) is
 * published, exactly what a lawyer would receive. Nobody can write as it, so it cannot be vandalised.
 */
export function renderDemo(app: HTMLElement): () => void {
  const lawyer = h("button", { type: "button", id: "lawyer-demo" }, "Read the demo journal");
  lawyer.addEventListener("click", () => go(`#/lawyer?a=${DEMO_ADDRESS}&k=${DEMO_CONTENT_KEY}`));
  app.replaceChildren(
    h("h1", {}, "Demo journal"),
    h("p", {}, "This journal belongs to nobody. Every entry in it is synthetic, written to the Arkiv testnet so you can inspect how Safe Journal works."),
    h("p", {}, "You get the same read only link a lawyer would receive: every entry, its proven write time, and the proof behind it. Nobody holds the passphrase to write as this journal, so it cannot be changed."),
    h("div", { class: "actions" }, lawyer, h("a", { href: "#/proof", class: "button" }, "See the proof")),
    h("h2", {}, "Try it yourself"),
    h("p", {}, "Start your own journal in a private tab and write an entry. Please keep it synthetic. It is funded, written and proven in about ten seconds."),
    h("div", { class: "actions" }, h("a", { href: "#/start", class: "button" }, "Start a journal")),
  );
  return () => {};
}
