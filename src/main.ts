import { go } from "./ui/dom";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { mountHeader } from "./ui/header";
import { renderOpen } from "./ui/open";
import { renderJournal } from "./ui/journal";
import { renderWrite } from "./ui/write";
import { renderShare } from "./ui/share";
import { renderLawyer } from "./ui/lawyer";
import { renderDemo } from "./ui/demo";
import { renderProof } from "./ui/proof";
import { renderLanding } from "./ui/landing";
import { renderStart } from "./ui/start";
import { renderDecoy } from "./ui/decoy";
import { mountFooter } from "./ui/footer";
import { initMotion } from "./ui/motion";
import { startAutoLock } from "./ui/lock";

const screens: Record<string, (app: HTMLElement) => () => void> = {
  "#/": renderLanding,
  "#/open": renderOpen,
  "#/start": renderStart,
  "#/decoy": renderDecoy,
  "#/journal": renderJournal,
  "#/write": renderWrite,
  "#/share": renderShare,
  "#/lawyer": renderLawyer,
  "#/demo": renderDemo,
  "#/proof": renderProof,
};
let cleanup: () => void = () => {};

const routes: Record<string, { title: string; text: string }> = {
  "#/": { title: "Write it down. Keep it safe. Make it count.", text: "A private journal for documenting abuse." },
  "#/open": { title: "Open journal", text: "Enter your passphrase to open your journal. Use a private tab." },
  "#/start": { title: "Start your journal", text: "Choose six words to open your journal." },
  "#/decoy": { title: "An everyday journal", text: "A second passphrase that opens ordinary notes." },
  "#/journal": {
    title: "Journal",
    text: "Your entries in time order, each showing when you said it happened and when it was written.",
  },
  "#/write": {
    title: "Write an entry",
    text: "Record what happened, when it happened, a category and an optional photo.",
  },
  "#/share": {
    title: "Share with a lawyer",
    text: "Create a read only link so a lawyer or advocate can view your journal.",
  },
  "#/lawyer": {
    title: "Shared journal",
    text: "A read only, printable timeline with the proven write time of each entry.",
  },
  "#/demo": { title: "Demo journal", text: "A synthetic journal for judges to open and inspect." },
  "#/proof": {
    title: "Proof",
    text: "The live state of the demo journal and the creator addresses, with explorer links.",
  },
};

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;
  const path = location.hash.split("?")[0] ?? "";
  const route = routes[path];
  if (!route) {
    go("#/");
    return;
  }
  cleanup();
  cleanup = () => {};
  const screen = screens[path];
  if (screen) {
    cleanup = screen(app);
    afterRender();
    return;
  }
  const h1 = document.createElement("h1");
  h1.textContent = route.title;
  const p = document.createElement("p");
  p.textContent = route.text;
  app.replaceChildren(h1, p);
  afterRender();
}

/** Where to scroll once the next screen is drawn (set by links that point at a section). */
let pendingScroll: string | null = null;
function afterRender(): void {
  const id = pendingScroll;
  pendingScroll = null;
  if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  else window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
// Hash links navigate in place too, so the back button holds at most one entry for this site.
document.addEventListener("click", (e) => {
  const a = (e.target as Element | null)?.closest?.("a[href^='#']");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href")!;
  const scrollTo = a.getAttribute("data-scroll");
  if (scrollTo) {
    if (location.hash === href) {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    pendingScroll = scrollTo;
  }
  go(href);
});
mountHeader();
mountFooter();
initMotion();
startAutoLock();
if (!location.hash) go("#/");
render();
