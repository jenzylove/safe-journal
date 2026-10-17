import "./styles.css";
import { mountLeaveNow } from "./ui/leave-now";

const app = document.getElementById("app");
if (app) {
  const h1 = document.createElement("h1");
  h1.textContent = "Standalone reader";
  const p = document.createElement("p");
  p.textContent = "Reads a journal straight from the Arkiv RPC with a passphrase or a share link.";
  app.replaceChildren(h1, p);
}
mountLeaveNow();
