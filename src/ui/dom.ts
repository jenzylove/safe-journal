type Child = Node | string | null | undefined | false;

/** Tiny DOM builder. Strings become text nodes, never HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (typeof v === "boolean") {
      if (v) el.setAttribute(k, "");
    } else if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function link(href: string, text: string, external = true): HTMLAnchorElement {
  const a = h("a", { href }, text);
  if (external) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  return a;
}

export function short(s: string, head = 8, tail = 6): string {
  return s.length > head + tail + 3 ? `${s.slice(0, head)}...${s.slice(-tail)}` : s;
}

export function fmtTime(d: Date): string {
  return d.toLocaleString();
}

export function errText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";
}

export function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64Url(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const CATEGORY_LABELS: Record<string, string> = {
  physical: "Physical harm",
  threats: "Threats",
  financial: "Money or property",
  digital: "Phone, messages or online",
  other: "Something else",
};

/** Navigate without adding a history entry, so Back never walks through the journal's screens. */
export function go(hash: string): void {
  location.replace(hash.startsWith("#") ? hash : `#${hash}`);
}
