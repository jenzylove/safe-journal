import { deriveKeys } from "../lib";
import { DEMO_PASSPHRASE } from "../demo";
import { setSession } from "../session";
import { errText, h, toB64Url } from "./dom";

/** Judge path: open the synthetic demo journal with its published passphrase. */
export function renderDemo(app: HTMLElement): () => void {
  const status = h("p", { role: "status" });
  const open = h("button", { type: "button", id: "open-demo" }, "Open the demo journal");
  const lawyer = h("button", { type: "button", id: "lawyer-demo" }, "See it as a lawyer would");
  const run = async (to: "journal" | "lawyer") => {
    open.disabled = lawyer.disabled = true;
    status.textContent = "Opening...";
    try {
      const k = await deriveKeys(DEMO_PASSPHRASE);
      if (to === "journal") {
        setSession(k);
        location.hash = "#/journal";
      } else {
        location.hash = `#/lawyer?a=${k.address}&k=${toB64Url(k.contentKeyRaw)}`;
      }
    } catch (e) {
      status.className = "error";
      status.textContent = errText(e);
      open.disabled = lawyer.disabled = false;
    }
  };
  open.addEventListener("click", () => run("journal"));
  lawyer.addEventListener("click", () => run("lawyer"));
  app.replaceChildren(
    h("h1", {}, "Demo journal"),
    h("p", {}, "This journal belongs to nobody. Every entry in it is synthetic, written to the Arkiv testnet so you can inspect how Safe Journal works."),
    h("p", {}, "Its passphrase is public on purpose:"),
    h("p", { class: "mono" }, DEMO_PASSPHRASE),
    h("p", { class: "hint" }, "You can add your own test entry to it too. Please keep it synthetic."),
    h("div", { class: "actions" }, open, lawyer, h("a", { href: "#/proof", class: "button" }, "See the proof")),
    status,
  );
  return () => {};
}
