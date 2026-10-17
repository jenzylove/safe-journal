import "./styles.css";
import { mountLeaveNow } from "./ui/leave-now";

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
  const route = routes[location.hash];
  if (!route) {
    location.hash = "#/";
    return;
  }
  const h1 = document.createElement("h1");
  h1.textContent = route.title;
  const p = document.createElement("p");
  p.textContent = route.text;
  app.replaceChildren(h1, p);
}

window.addEventListener("hashchange", render);
mountLeaveNow();
if (!location.hash) location.hash = "#/";
render();
