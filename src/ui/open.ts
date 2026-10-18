import { checkPassphrase, deriveKeys, generatePassphrase, unknownWords } from "../lib";
import { listEntries } from "../arkiv/journal";
import { setSession } from "../session";
import { errText, h, go } from "./dom";

export function renderOpen(app: HTMLElement): () => void {
  const input = h("input", {
    type: "password",
    id: "passphrase",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "off",
    "aria-describedby": "verdict",
  });
  const label = h("label", { for: "passphrase" }, "Passphrase");
  const show = h("button", { type: "button", id: "show-pass" }, "Show");
  const verdict = h("p", { id: "verdict", "aria-live": "polite" });
  const note = h("p", { id: "gen-note", "aria-live": "polite" });
  const status = h("p", { id: "open-status", role: "status" });
  const openBtn = h("button", { type: "submit", id: "open-btn" }, "Open journal");
  const gen = h("button", { type: "button", id: "gen-btn" }, "New here? Generate a passphrase");

  function update(): void {
    const v = input.value;
    if (!v) {
      verdict.textContent = "";
      verdict.className = "";
      return;
    }
    const bad = unknownWords(v);
    if (bad.length) {
      verdict.textContent = `Check word ${bad.join(" and ")}: it is not one of the words Safe Journal uses. Capitals and extra spaces do not matter.`;
      verdict.className = "warn";
      return;
    }
    const r = checkPassphrase(v);
    if (r.ok) {
      verdict.textContent = "This passphrase is strong.";
      verdict.className = "ok";
    } else {
      verdict.textContent = `${r.reason ?? "This passphrase is weak."} If this is a passphrase you already use, open it. New passphrases must be strong.`;
      verdict.className = "warn";
    }
  }

  input.addEventListener("input", update);
  show.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    show.textContent = hidden ? "Hide" : "Show";
  });
  gen.addEventListener("click", () => {
    input.value = generatePassphrase(6);
    input.type = "text";
    show.textContent = "Hide";
    note.textContent =
      "These six words are your key. Write them down on paper and keep that somewhere safe. If you lose them, nobody can get your journal back.";
    update();
  });

  const form = h(
    "form",
    {},
    label,
    h("div", { class: "field" }, input, show),
    verdict,
    note,
    h("div", { class: "actions" }, openBtn, gen),
    status,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value) {
      status.textContent = "Type your passphrase first.";
      return;
    }
    openBtn.disabled = true;
    gen.disabled = true;
    status.className = "";
    status.textContent = "Opening...";
    try {
      const k = await deriveKeys(input.value);
      if (!checkPassphrase(input.value).ok) {
        // A weak passphrase may open an existing journal, but never start a new one: the
        // ciphertext is public forever, so a guessable passphrase would expose everything.
        status.textContent = "Checking for an existing journal...";
        const existing = await listEntries(k.address, null);
        if (!existing.length) {
          k.contentKeyRaw.fill(0);
          throw new Error("No journal uses this passphrase yet, and it is too easy to guess to start one. Choose Start my journal to get six strong words.");
        }
      }
      setSession({ address: k.address, signingKey: k.signingKey, contentKey: k.contentKey, contentKeyRaw: k.contentKeyRaw });
      input.value = "";
      go("#/journal");
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      openBtn.disabled = false;
      gen.disabled = false;
    }
  });

  app.replaceChildren(
    h("h1", {}, "Open journal"),
    h("p", {}, "Enter your passphrase to open your journal."),
    h("p", {}, "Use a private tab. Nothing is saved on this device."),
    form,
  );
  return () => {};
}
