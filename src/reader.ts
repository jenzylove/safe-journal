import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
// Standalone reader: one self-contained HTML file. It needs nothing from our site, only the public
// Arkiv RPC. Open it with a passphrase or paste a lawyer link, and it shows the journal.
import "./styles.css";
import { mountHeader } from "./ui/header";
import { skyBand } from "./ui/sky";
import { deriveKeys } from "./lib";
import { errText, h, go } from "./ui/dom";
import { setRpc } from "./arkiv/journal";
import { renderLawyer, type LawyerAccess } from "./ui/lawyer";

const app = document.getElementById("app")!;
let cleanup: () => void = () => {};

/** The node the reader asks by default. The field below is never saved anywhere. */
const DEFAULT_NODE = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";

/** A checked node address, or an error in plain words. */
function nodeAddress(raw: string): string {
  const value = raw.trim() || DEFAULT_NODE;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("That Arkiv node address is not a web address. It should start with https://");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("That Arkiv node address must start with https://");
  return url.toString().replace(/\/$/, "");
}

/** Points every read at the node the person chose. Kept in memory only. */
function applyNode(url: string): void {
  setRpc(url);
}

/** `given` carries a passphrase's keys in memory; with none, the journal comes from the address bar. */
function showLawyer(given?: LawyerAccess): void {
  cleanup();
  cleanup = renderLawyer(app, given);
  const close = h("button", { type: "button", class: "no-print" }, "Close journal");
  close.addEventListener("click", () => {
    if (location.hash.startsWith("#/lawyer?")) go("#/");
    else home();
  });
  app.firstElementChild?.after(
    h("p", { class: "hint" }, "Standalone reader. Read directly from Arkiv; no Safe Journal server involved."),
    h("div", { class: "actions no-print" }, close),
  );
}

function home(): void {
  cleanup();
  cleanup = () => {};
  const pass = h("input", { type: "password", id: "passphrase", autocomplete: "off" });
  const linkIn = h("input", { type: "text", id: "share-link", placeholder: "or paste a lawyer link" });
  const nodeIn = h("input", { type: "text", id: "arkiv-node", value: DEFAULT_NODE, autocomplete: "off", spellcheck: "false", autocapitalize: "off" });
  const nodeBox = h("details", {}, h("summary", {}, "Use a different Arkiv node"), h("label", { for: "arkiv-node" }, "Arkiv node"), nodeIn, h("p", { class: "hint" }, "Leave this as it is unless you run your own node. It is not saved."));
  const status = h("p", { role: "status" });
  const submitBtn = h("button", { type: "submit" }, "Open");
  const form = h(
    "form",
    {},
    h("label", { for: "passphrase" }, "Passphrase"),
    pass,
    h("label", { for: "share-link" }, "Lawyer link"),
    linkIn,
    nodeBox,
    h("div", { class: "actions" }, submitBtn),
    status,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    status.className = "";
    try {
      try {
        applyNode(nodeAddress(nodeIn.value));
      } catch (nodeErr) {
        nodeBox.open = true;
        throw nodeErr;
      }
      const pasted = linkIn.value.trim();
      if (pasted) {
        const i = pasted.indexOf("#/lawyer?");
        if (i < 0) throw new Error("That is not a lawyer link.");
        go(pasted.slice(i));
      } else {
        status.textContent = "Opening...";
        const k = await deriveKeys(pass.value);
        // The keys stay in memory and go straight to the journal view: nothing goes into the address bar.
        pass.value = "";
        k.contentKeyRaw.fill(0);
        showLawyer({ address: k.address, contentKey: k.contentKey });
      }
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      submitBtn.disabled = false;
    }
  });
  app.replaceChildren(skyBand(h("h1", {}, "Safe Journal reader"), h("p", {}, "This one file reads a journal straight from Arkiv. It works even if the Safe Journal website is gone.")), form);
}

function route(): void { if (location.hash.startsWith("#/lawyer?")) showLawyer(); else home(); }
window.addEventListener("hashchange", route);
mountHeader({ minimal: true });
route();
