import "@fontsource/newsreader/latin-500.css";
import "@fontsource/newsreader/latin-600.css";
import "@fontsource/newsreader/latin-400-italic.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
// Standalone reader: one self-contained HTML file. It needs nothing from our site, only the public
// Arkiv RPC. Open it with a passphrase or paste a lawyer link, and it shows the journal.
import "./styles.css";
import { mountLeaveNow } from "./ui/leave-now";
import { deriveKeys } from "./lib";
import { errText, h, toB64Url, go } from "./ui/dom";
import { renderLawyer } from "./ui/lawyer";

const app = document.getElementById("app")!;
let cleanup: () => void = () => {};

function showLawyer(): void {
  cleanup();
  cleanup = renderLawyer(app);
  app.prepend(h("p", { class: "hint" }, "Standalone reader. Read directly from Arkiv; no Safe Journal server involved."));
}

function home(): void {
  cleanup();
  const pass = h("input", { type: "password", id: "passphrase", autocomplete: "off" });
  const linkIn = h("input", { type: "text", id: "share-link", placeholder: "or paste a lawyer link" });
  const status = h("p", { role: "status" });
  const submitBtn = h("button", { type: "submit" }, "Open");
  const form = h("form", {}, h("label", { for: "passphrase" }, "Passphrase"), pass, h("label", { for: "share-link" }, "Lawyer link"), linkIn, h("div", { class: "actions" }, submitBtn), status);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      const pasted = linkIn.value.trim();
      if (pasted) {
        const i = pasted.indexOf("#/lawyer?");
        if (i < 0) throw new Error("That is not a lawyer link.");
        go(pasted.slice(i));
      } else {
        status.textContent = "Opening...";
        const k = await deriveKeys(pass.value);
        go(`#/lawyer?a=${k.address}&k=${toB64Url(k.contentKeyRaw)}`);
      }
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      submitBtn.disabled = false;
    }
  });
  app.replaceChildren(h("h1", {}, "Safe Journal reader"), h("p", {}, "This one file reads a journal straight from Arkiv. It works even if the Safe Journal website is gone."), form);
}

function route(): void { if (location.hash.startsWith("#/lawyer?")) showLawyer(); else home(); }
window.addEventListener("hashchange", route);
mountLeaveNow();
route();
