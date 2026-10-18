import { deriveKeys, generatePassphrase } from "../lib";
import { setSession } from "../session";
import { errText, h, go } from "./dom";
import { skyBand } from "./sky";

export function renderStart(app: HTMLElement): () => void {
  let words = "";
  const show = h("button", { type: "button", id: "show-words" }, "Show my six words");
  const area = h("div", { id: "words-area" });
  area.hidden = true;
  const box = h("p", { class: "mono big-words", id: "words", "aria-live": "polite" });
  const again = h("button", { type: "button", id: "regen" }, "Give me different words");
  const attrs = { type: "text", autocomplete: "off", spellcheck: "false", autocapitalize: "off" };
  const w2 = h("input", { ...attrs, id: "w2" });
  const w5 = h("input", { ...attrs, id: "w5" });
  const status = h("p", { id: "start-status", role: "status" });
  const openBtn = h("button", { type: "submit", id: "start-btn" }, "Open my new journal");
  openBtn.disabled = true;

  function check(): void {
    const p = words.split(" ");
    openBtn.disabled =
      !words ||
      w2.value.trim().toLowerCase() !== (p[1] ?? "").toLowerCase() ||
      w5.value.trim().toLowerCase() !== (p[4] ?? "").toLowerCase();
  }
  const gen = (): void => {
    words = generatePassphrase(6);
    box.textContent = words;
    w2.value = "";
    w5.value = "";
    check();
  };
  w2.addEventListener("input", check);
  w5.addEventListener("input", check);
  show.addEventListener("click", () => {
    gen();
    area.hidden = false;
    show.hidden = true;
  });
  again.addEventListener("click", gen);

  const form = h(
    "form",
    {},
    h("p", {}, "To check you saved them, type word 2 and word 5."),
    h("label", { for: "w2" }, "Word 2"),
    w2,
    h("label", { for: "w5" }, "Word 5"),
    w5,
    h("div", { class: "actions" }, openBtn),
    status,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    check();
    if (openBtn.disabled) return;
    openBtn.disabled = true;
    again.disabled = true;
    status.className = "";
    status.textContent = "Opening...";
    try {
      const k = await deriveKeys(words);
      setSession({ address: k.address, signingKey: k.signingKey, contentKey: k.contentKey, contentKeyRaw: k.contentKeyRaw, fresh: true });
      words = "";
      box.textContent = "";
      w2.value = "";
      w5.value = "";
      go("#/journal");
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      again.disabled = false;
      check();
    }
  });

  area.append(
    box,
    h("p", {}, "Write them on paper and keep it somewhere only you can reach. If you lose them, nobody can open your journal, not even us."),
    h("p", {}, again),
    form,
  );
  app.replaceChildren(
    skyBand(h("h1", {}, "Start your journal"), h("p", {}, "Your journal opens with six words. There is no account and no reset, so these words are the only way in.")),
    h("div", { class: "actions" }, show),
    area,
    h("p", { class: "quiet-link" }, "Prefer your own passphrase? ", h("a", { href: "#/open" }, "Open with it here.")),
  );
  return () => {
    words = "";
  };
}
