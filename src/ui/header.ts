import { getSession } from "../session";
import { h } from "./dom";
import { mountLeaveNow } from "./leave-now";
import { ensureCloudFilter, logoMark } from "./sky";

/** Top of every page: brand, a few links, and Leave now. Not fixed; Leave now pins itself when the header scrolls away. */
export function mountHeader(opts: { minimal?: boolean } = {}): void {
  if (document.getElementById("site-header")) return;
  ensureCloudFilter();

  const mark = h("a", { class: "mark", href: "#/" }, logoMark(), "Safe Journal");
  const nav = h(
    "nav",
    { class: "site-nav", "aria-label": "Main" },
    h("a", { href: "#/", "data-scroll": "how" }, "How it works"),
    h("a", { href: "#/demo" }, "Demo"),
    h("a", { href: "#/proof" }, "Proof"),
  );
  const open = h("a", { class: "pill light open-link", href: "#/open", id: "header-open" }, "Open my journal");
  const slot = h("span", { class: "leave-slot" });
  const right = h("div", { class: "header-right" }, ...(opts.minimal ? [] : [open]), slot);
  const header = h("header", { id: "site-header", class: "site-header no-print" }, mark, ...(opts.minimal ? [] : [nav]), right);
  document.body.prepend(header);

  const btn = mountLeaveNow(slot);

  const sync = (): void => {
    if (getSession()) {
      open.textContent = "My journal";
      open.setAttribute("href", "#/journal");
    } else {
      open.textContent = "Open my journal";
      open.setAttribute("href", "#/open");
    }
  };
  sync();
  window.addEventListener("hashchange", sync);

  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(([e]) => {
      btn.classList.toggle("floating", !!e && !e.isIntersecting);
    }).observe(header);
  }
}
