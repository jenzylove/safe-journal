import { DEMO_ADDRESS, DEMO_CONTENT_KEY } from "../demo";
import { h, go } from "./dom";
import { skyBand } from "./sky";

/**
 * Judge path. The demo journal is synthetic; only its read-only link (address plus content key) is
 * published, exactly what a lawyer would receive. Nobody can write as it, so it cannot be vandalised.
 */
export function renderDemo(app: HTMLElement): () => void {
  const lawyer = h("button", { type: "button", id: "lawyer-demo" }, "Open the demo journal");
  lawyer.addEventListener("click", () => go(`#/lawyer?a=${DEMO_ADDRESS}&k=${DEMO_CONTENT_KEY}`));
  app.replaceChildren(
    skyBand(
      h("h1", {}, "Demo journal"),
      h("p", {}, "A synthetic journal, opened the way a lawyer would see it."),
    ),
    h("div", { class: "actions demo-actions" }, lawyer, h("a", { href: "#/proof", class: "text-link" }, "See the live proof")),
    h("p", { class: "quiet-link" }, "Or ", h("a", { href: "#/start" }, "start your own journal"), " in a private tab."),
  );
  return () => {};
}
