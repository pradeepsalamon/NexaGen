"use client";

import { useEffect } from "react";

/**
 * Adds `.is-visible` to `.reveal` elements as they enter the viewport.
 * Uses a single IntersectionObserver (no scroll listeners, no layout reads on
 * scroll) so it stays cheap on low-end mobile devices. Scoped to `.academy-page`
 * so it never touches `.reveal`-classed elements elsewhere in the app (there
 * are none today, but this keeps the academy page self-contained).
 */
export function ScrollObserver() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveal = (el: Element) => el.classList.add("is-visible");

    if (reduceMotion || !("IntersectionObserver" in window)) {
      document.querySelectorAll(".academy-page .reveal").forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 }
    );

    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll(".academy-page .reveal:not(.is-visible)").forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          io.observe(el);
        }
      });
    };

    scan();

    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return null;
}
