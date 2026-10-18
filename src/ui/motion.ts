/** Scroll reveal and a gentle cloud parallax. Content stays visible unless this script runs and motion is allowed. */
export function initMotion(): void {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver(
      (batch) => {
        let n = 0;
        for (const e of batch) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${n++ * 60}ms`;
          el.classList.add("in");
          io.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    const seen = new WeakSet<Element>();
    const scan = (root: ParentNode): void => {
      root.querySelectorAll?.(".reveal").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    };
    document.documentElement.classList.add("js-reveal");
    const app = document.getElementById("app");
    if (app) {
      scan(app);
      new MutationObserver((ms) => {
        for (const m of ms) m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.classList.contains("reveal") && !seen.has(n)) {
            seen.add(n);
            io.observe(n);
          }
          scan(n);
        });
      }).observe(app, { childList: true, subtree: true });
    }
  }

  let ticking = false;
  const update = (): void => {
    ticking = false;
    const panel = document.querySelector<HTMLElement>(".panel");
    if (!panel) return;
    const y = Math.min(40, Math.max(0, window.scrollY * 0.08));
    panel.style.setProperty("--py", `${-y}px`);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
}
