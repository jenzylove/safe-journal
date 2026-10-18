import { writeEntry } from "../arkiv/journal";
import { deriveKeys, generatePassphrase } from "../lib";
import { getSession } from "../session";
import { errText, h, go } from "./dom";
import { skyBand } from "./sky";
import { ensureFunded } from "./fund";

const DEFAULT_NOTES = ["Pick up bread and tomatoes on the way home", "Call mum on Sunday evening", "Pay the light bill before Friday"];

export function renderDecoy(app: HTMLElement): () => void {
  if (!getSession()) {
    go("#/open");
    return () => {};
  }
  let words = "";
  const show = h("button", { type: "button", id: "show-decoy" }, "Show the everyday passphrase");
  const area = h("div", { id: "decoy-area" });
  area.hidden = true;
  const box = h("p", { class: "mono big-words", id: "decoy-words" });
  const status = h("p", { id: "decoy-status", role: "status" });
  const create = h("button", { type: "submit", id: "decoy-btn" }, "Create everyday journal");
  const inputs = DEFAULT_NOTES.map((n, i) =>
    h("input", { type: "text", id: `note${i}`, "aria-label": `Note ${i + 1}`, value: n, maxlength: "200" }),
  );
  const done = h("div", { id: "decoy-done" });
  done.hidden = true;

  show.addEventListener("click", () => {
    words = generatePassphrase(6);
    box.textContent = words;
    area.hidden = false;
    show.hidden = true;
  });

  const form = h("form", {}, h("h2", {}, "Ordinary notes"), ...inputs, h("div", { class: "actions" }, create), status);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!words) return;
    const say = (m: string): void => {
      status.className = "";
      status.textContent = m;
    };
    create.disabled = true;
    inputs.forEach((i) => (i.disabled = true));
    say("Preparing...");
    let raw: Uint8Array | undefined;
    try {
      const decoy = await deriveKeys(words);
      raw = decoy.contentKeyRaw;
      await ensureFunded(decoy.address, say);
      let n = 0;
      for (let i = 0; i < inputs.length; i++) {
        const text = inputs[i]!.value.trim();
        if (!text) continue;
        n++;
        say(`Saving note ${n}...`);
        // The time the note is written, never an earlier one: a backdated note would not match the chain.
        await writeEntry(decoy.signingKey, decoy.contentKey, { v: 1, happenedAt: new Date().toISOString(), category: "other", text }, 1);
      }
      status.textContent = "";
      form.hidden = true;
      done.hidden = false;
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      create.disabled = false;
      inputs.forEach((i) => (i.disabled = false));
    } finally {
      raw?.fill(0);
    }
  });

  done.append(
    h("p", { class: "ok" }, "Your everyday journal is ready. Opening it with those six words shows only these notes."),
    h("p", { class: "hint" }, "To make it look lived in, open it now and then and add an ordinary note."),
    h("p", {}, h("a", { href: "#/journal", class: "button" }, "Back to my journal")),
  );
  area.append(box, h("p", {}, "Learn these six words too. Use them only if you are forced."), form, done);
  app.replaceChildren(
    skyBand(
      h("h1", {}, "An everyday journal"),
      h(
        "p",
        {},
        "If someone forces you to open your journal, you can give them a different passphrase. It opens a separate journal of ordinary notes, and your real one stays closed. Nothing on Arkiv links the two journals.",
      ),
    ),
    h("div", { class: "actions" }, show),
    area,
  );
  return () => {
    words = "";
  };
}
