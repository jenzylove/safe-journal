import { go } from "./ui/dom";
import "@fontsource/newsreader/latin-500.css";
import "@fontsource/newsreader/latin-600.css";
import "@fontsource/newsreader/latin-400-italic.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "./styles.css";
import { mountLeaveNow } from "./ui/leave-now";
import { renderOpen } from "./ui/open";
import { renderJournal } from "./ui/journal";
import { renderWrite } from "./ui/write";
import { renderShare } from "./ui/share";
import { renderLawyer } from "./ui/lawyer";
import { renderDemo } from "./ui/demo";
import { renderProof } from "./ui/proof";

const screens: Record<string, (app: HTMLElement) => () => void> = {
  "#/": renderOpen,
  "#/journal": renderJournal,
  "#/write": renderWrite,
  "#/share": renderShare,
  "#/lawyer": renderLawyer,
  "#/demo": renderDemo,
  "#/proof": renderProof,
};
let cleanup: () => void = () => {};

const routes: Record<string, { title: string; text: string }> = {
  "#/": { title: "Open journal", text: "Enter your passphrase to open your journal. Use a private tab." },
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
    title: "Lawyer view",
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
    return;
  }
  const h1 = document.createElement("h1");
  h1.textContent = route.title;
  const p = document.createElement("p");
  p.textContent = route.text;
  app.replaceChildren(h1, p);
}

window.addEventListener("hashchange", render);
// Hash links navigate in place too, so the back button holds at most one entry for this site.
document.addEventListener("click", (e) => {
  const a = (e.target as Element | null)?.closest?.("a[href^='#']");
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute("href")!);
});
mountLeaveNow();
if (!location.hash) go("#/");
render();
