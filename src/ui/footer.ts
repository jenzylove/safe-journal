import { h } from "./dom";

export function mountFooter(): void {
  if (document.getElementById("site-footer")) return;
  const reader = h("a", { href: "/reader.html", download: "notes-reader.html" }, "Standalone reader");
  const source = h("a", { href: "https://github.com/jenzylove/safe-journal", target: "_blank", rel: "noopener noreferrer" }, "Source");
  const footer = h(
    "footer",
    { id: "site-footer", class: "site-footer no-print" },
    h(
      "nav",
      { "aria-label": "More" },
      h("a", { href: "#/", "data-scroll": "how" }, "How it works"),
      h("a", { href: "#/demo" }, "Demo"),
      h("a", { href: "#/proof" }, "Proof"),
      reader,
      source,
    ),
    h("p", {}, "Built on Arkiv. Nothing you write is stored on this device or on our servers."),
  );
  document.getElementById("app")?.after(footer);
}
