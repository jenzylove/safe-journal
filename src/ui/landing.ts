import { h } from "./dom";
import { seal } from "./entry-view";

function step(n: number, title: string, body: string): HTMLElement {
  return h("li", {}, h("span", { class: "step-n", "aria-hidden": "true" }, String(n)), h("h3", {}, title), h("p", {}, body));
}
function point(title: string, body: string): HTMLElement {
  return h("div", { class: "point" }, h("h3", {}, title), h("p", {}, body));
}

export function renderLanding(app: HTMLElement): () => void {
  const sealWrap = h(
    "div",
    { class: "hero-seal" },
    seal(727772n),
    h("p", {}, "Every entry gets a seal like this: the moment it reached Arkiv, which nobody can change."),
  );
  const ext = h(
    "a",
    { href: "https://github.com/jenzylove/safe-journal/blob/main/arkiv/schema.md", target: "_blank", rel: "noopener noreferrer" },
    "Read the data contract",
  );

  app.replaceChildren(
    h(
      "section",
      { class: "hero" },
      h("h1", {}, "Write it down. Keep it safe. Make it count."),
      h(
        "p",
        { class: "lede" },
        "A private journal for documenting abuse. Nothing is kept on your phone, nobody can delete what you write, and every entry carries proof of when it was written.",
      ),
      h(
        "div",
        { class: "actions" },
        h("a", { href: "#/start", class: "button" }, "Start my journal"),
        h("a", { href: "#/open", class: "text-link" }, "I already have a journal"),
      ),
      h("p", { class: "quiet-link" }, h("a", { href: "#/demo" }, "See a demo journal")),
      sealWrap,
    ),
    h("p", { class: "safety-note" }, "Use a private tab. Press Leave now, or Escape three times, to jump straight to the weather."),
    h(
      "section",
      { class: "band" },
      h("h2", {}, "How it works"),
      h(
        "ol",
        { class: "steps" },
        step(1, "Choose six words", "Your journal opens with a passphrase only you know. No account, no email, no phone number."),
        step(2, "Write what happened", "Your words and photos are locked on this device before they leave it. Photos lose their location details."),
        step(3, "Share when you are ready", "Give your lawyer a link that opens only the entries you choose, each with its proof."),
      ),
    ),
    h(
      "section",
      { class: "band" },
      h("h2", {}, "Why it holds up"),
      point("The time is proven.", "Each entry is stamped with the moment it reached Arkiv, a public record nobody controls. Not your phone's clock, and not ours."),
      point("Nobody can delete it.", "Not you under pressure, not someone holding your phone, not us."),
      point("It outlives this website.", "If this site ever disappears, a single file reader still opens your journal."),
      point("Only you can read it.", "The public record shows locked data and nothing about you."),
    ),
    h(
      "section",
      { class: "band" },
      h("h2", {}, "If someone makes you open it"),
      h(
        "p",
        {},
        "You can set up a second passphrase that opens an everyday journal of ordinary notes. Your real journal stays closed, and nothing shows that it exists.",
      ),
      h("p", {}, h("a", { href: "#/start" }, "Set one up after you start")),
    ),
    h(
      "section",
      { class: "band" },
      h("h2", {}, "The technology, briefly"),
      h(
        "p",
        {},
        "Safe Journal stores each entry on Arkiv, a database that lives on a blockchain. Every entry is encrypted in your browser, written in one transaction that hands it to an address nobody controls, and kept for as long as you choose: one, two or five years. Anyone you trust can keep it alive longer.",
      ),
      h("p", { class: "link-row" }, h("a", { href: "#/proof" }, "See the live proof"), ext, h("a", { href: "#/demo" }, "Try the demo journal")),
    ),
    h("section", { class: "final" }, h("a", { href: "#/start", class: "button" }, "Start my journal")),
  );
  return () => {};
}
