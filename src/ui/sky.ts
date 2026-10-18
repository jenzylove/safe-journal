import { h } from "./dom";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string>, ...kids: Element[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

/** The turbulence filter that makes the clouds soft. Added once. */
export function ensureCloudFilter(): void {
  if (document.getElementById("cloudy")) return;
  const filter = svgEl(
    "filter",
    { id: "cloudy" },
    svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: ".012", numOctaves: "4", seed: "7" }),
    svgEl("feDisplacementMap", { in: "SourceGraphic", scale: "46" }),
  );
  const svg = svgEl("svg", { width: "0", height: "0", class: "cloud-defs", "aria-hidden": "true", focusable: "false" }, filter);
  document.body.prepend(svg);
}

export function logoMark(): SVGElement {
  return svgEl(
    "svg",
    { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", focusable: "false" },
    svgEl("rect", { x: "3", y: "3", width: "18", height: "18", rx: "6", fill: "currentColor", class: "logo-tile" }),
    svgEl("path", { d: "M8 12.2l2.6 2.6L16 9.4", stroke: "#fff", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
}

/** A cloud is a few overlapping soft puffs; their shapes live in the stylesheet. */
export function cloud(cls: string, puffs: number): HTMLElement {
  const c = h("div", { class: `cloud ${cls}`, "aria-hidden": "true" });
  for (let i = 0; i < puffs; i++) c.append(h("span"));
  return c;
}

/** The smaller sky panel at the top of every screen except the landing. */
export function skyBand(...children: (Node | string)[]): HTMLElement {
  return h("section", { class: "sky-band" }, cloud("c1", 4), h("div", { class: "sky-inner" }, ...children));
}
