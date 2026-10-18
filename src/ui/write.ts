import { blockTime, getOne, LIFETIMES, writeEntry, type LifetimeYears } from "../arkiv/journal";
import { CATEGORIES, type Category } from "../lib";
import { getSession } from "../session";
import { CATEGORY_LABELS, errText, fmtTime, h, go } from "./dom";
import { preparePhoto } from "./photo";
import { ensureFunded } from "./fund";

const MAX_TEXT = 8000;

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}


export function renderWrite(app: HTMLElement): () => void {
  const s = getSession();
  if (!s) {
    go("#/");
    return () => {};
  }

  const text = h("textarea", { id: "text", rows: "8", maxlength: String(MAX_TEXT), required: true });
  const when = h("input", { type: "datetime-local", id: "when", required: true, value: localNow() });
  const cat = h("select", { id: "category" });
  for (const c of CATEGORIES) cat.append(h("option", { value: c }, CATEGORY_LABELS[c] ?? c));
  const life = h("select", { id: "lifetime" });
  for (const y of LIFETIMES) life.append(h("option", { value: String(y) }, `${y} ${y === 1 ? "year" : "years"}`));
  life.value = "2";
  const photo = h("input", { type: "file", id: "photo", accept: "image/*" });
  const status = h("p", { id: "write-status", role: "status" });
  const submit = h("button", { type: "submit", id: "save-btn" }, "Save entry");

  const form = h(
    "form",
    {},
    h("label", { for: "text" }, "What happened"),
    text,
    h("label", { for: "when" }, "When it happened"),
    when,
    h("label", { for: "category" }, "What kind of thing was it"),
    cat,
    h("label", { for: "lifetime" }, "How long to keep it"),
    life,
    h("p", { class: "hint" }, "Anyone you share the journal with can keep an entry alive for longer."),
    h("label", { for: "photo" }, "Photo (optional)"),
    photo,
    h("p", { class: "hint" }, "The photo is made smaller on this device and its hidden details, such as location, are removed."),
    h("div", { class: "actions" }, submit),
    status,
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    const body = text.value.trim();
    if (!body) {
      status.className = "error";
      status.textContent = "Write what happened first.";
      return;
    }
    const happened = new Date(when.value);
    if (Number.isNaN(happened.getTime())) {
      status.className = "error";
      status.textContent = "Choose when it happened.";
      return;
    }
    submit.disabled = true;
    status.className = "";
    try {
      let prepared: { bytes: Uint8Array; mime: string } | undefined;
      const file = photo.files?.[0];
      if (file) {
        status.textContent = "Preparing your photo...";
        prepared = await preparePhoto(file);
      }
      await ensureFunded(s.address, (m) => (status.textContent = m));
      status.textContent = "Saving...";
      const r = await writeEntry(
        s.signingKey,
        s.contentKey,
        { v: 1, happenedAt: happened.toISOString(), category: cat.value as Category, text: body },
        Number(life.value) as LifetimeYears,
        prepared,
      );
      let proven = "";
      try {
        const item = await getOne(r.entityKey, s.contentKey);
        proven = fmtTime(await blockTime(item.createdAtBlock));
      } catch {
        proven = "";
      }
      app.replaceChildren(
        h("h1", {}, "Saved"),
        h("p", {}, proven ? `Your entry was written at ${proven}, and Arkiv has proven that time.` : "Your entry was saved."),
        h("p", {}, h("a", { href: "#/journal", class: "button" }, "Back to journal")),
      );
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      submit.disabled = false;
    }
  });

  app.replaceChildren(h("h1", {}, "Write an entry"), h("p", { class: "hint" }, "Nothing here is saved on this device."), form);
  return () => {};
}
