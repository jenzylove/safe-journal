import { blockTime, getOne, LIFETIMES, writeEntry, type LifetimeYears } from "../arkiv/journal";
import { CATEGORIES, type Category } from "../lib";
import { getSession } from "../session";
import { CATEGORY_LABELS, errText, fmtTime, h, link, go } from "./dom";
import { skyBand } from "./sky";
import { preparePhoto } from "./photo";
import { ensureFunded } from "./fund";

const MAX_TEXT = 8000;
const FAUCET = "https://hub.arkiv.network/faucet";

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}


export function renderWrite(app: HTMLElement): () => void {
  const s = getSession();
  if (!s) {
    go("#/open");
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
  const extendable = h("input", { type: "checkbox", id: "extendable" });
  const status = h("p", { id: "write-status", role: "status" });
  // Shown only when the automatic top up fails: the person can pay for their own journal instead.
  const selfFund = h("p", { class: "hint", id: "self-fund" });
  selfFund.hidden = true;
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
    h("p", { class: "hint" }, "After this time the entry is removed from Arkiv. Nobody can shorten it."),
    h("label", { class: "check", for: "extendable" }, extendable, " Let my lawyer keep this entry longer"),
    h("p", { class: "hint" }, "Off unless you tick it. If you tick it, anyone holding the entry's address can add more time, which helps a court case outlast your choice. It never lets them read it."),
    h("label", { for: "photo" }, "Photo (optional)"),
    photo,
    h("p", { class: "hint" }, "The photo is made smaller on this device and its hidden details, such as location, are removed."),
    h("div", { class: "actions" }, submit),
    status,
    selfFund,
  );

  function showSelfFund(): void {
    const copy = h("button", { type: "button", class: "addr-copy" }, "Copy address");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(s!.address);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Select and copy it by hand";
      }
    });
    selfFund.replaceChildren(
      "You can also fund this journal yourself: send a little test GLM to ",
      h("span", { class: "addr" }, s!.address),
      " ",
      copy,
      " from ",
      link(FAUCET, FAUCET),
      ".",
    );
    selfFund.hidden = false;
  }

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
    selfFund.hidden = true;
    try {
      let prepared: { bytes: Uint8Array; mime: string } | undefined;
      const file = photo.files?.[0];
      if (file) {
        status.textContent = "Preparing your photo...";
        prepared = await preparePhoto(file);
      }
      try {
        await ensureFunded(s.address, (m) => (status.textContent = m));
      } catch (fundErr) {
        showSelfFund();
        throw fundErr;
      }
      status.textContent = "Saving...";
      const r = await writeEntry(
        s.signingKey,
        s.contentKey,
        { v: 1, happenedAt: happened.toISOString(), category: cat.value as Category, text: body },
        Number(life.value) as LifetimeYears,
        prepared,
        extendable.checked,
      );
      let proven = "";
      try {
        const item = await getOne(r.entityKey, s.contentKey);
        proven = fmtTime(await blockTime(item.createdAtBlock));
      } catch {
        proven = "";
      }
      app.replaceChildren(
        skyBand(h("h1", {}, "Saved"), h("p", {}, proven ? `Your entry was written at ${proven}, and Arkiv has proven that time.` : "Your entry was saved.")),
        h("p", {}, h("a", { href: "#/journal", class: "button" }, "Back to journal")),
      );
    } catch (err) {
      status.className = "error";
      status.textContent = errText(err);
      submit.disabled = false;
    }
  });

  app.replaceChildren(skyBand(h("h1", {}, "Write an entry"), h("p", { class: "hint" }, "Nothing here is saved on this device.")), form);
  return () => {};
}
