"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import "./hero3d.css";
import type { HeroScene } from "./scene";

/** Slow gold and blue light with a faint chessboard, behind a hero section. */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="hero3d-backdrop">
      <div className="hero3d-aura hero3d-aura-gold" />
      <div className="hero3d-aura hero3d-aura-blue" />
      <div className="hero3d-checker" />
    </div>
  );
}

const isDark = () => document.documentElement.dataset.theme === "dark";

/**
 * The floating 3D chessboard. The scene (three.js) is a separate chunk, fetched
 * only when the stage is near the screen and the browser is idle, so it never
 * delays the hero text. It draws only while on screen in a visible tab, follows
 * the theme from `data-theme` (not React state, so it changes on the same paint
 * as the page), and without WebGL the stage keeps just its glow.
 */
export function HeroStage({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let scene: HeroScene | null = null;
    let cancelled = false;
    let onScreen = false;
    let started = false;
    let idle = 0;

    const sync = () => scene?.setActive(onScreen && document.visibilityState === "visible");

    const start = () => {
      if (started) return;
      started = true;
      const load = () => {
        void import("./scene")
          .then(({ createHeroScene }) => {
            if (cancelled) return;
            scene = createHeroScene({
              canvas,
              container,
              dark: isDark(),
              lowPower: !window.matchMedia("(pointer: fine)").matches || (navigator.hardwareConcurrency ?? 4) < 4,
              onFrozen: () => setStill(true),
              onReady: () => setReady(true),
              reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            });
            sync();
          })
          .catch(() => {
            // No WebGL, or the chunk failed to load: the stage stays as its glow.
          });
      };
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(load, { timeout: 1200 });
      else load();
    };

    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        sync();
      },
      { rootMargin: "120px" }
    );
    visibility.observe(container);
    document.addEventListener("visibilitychange", sync);

    // The circular reveal swaps the whole page in one step, so the scene must not ease behind it.
    const theme = new MutationObserver(() =>
      scene?.setDark(isDark(), "themeReveal" in document.documentElement.dataset)
    );
    theme.observe(document.documentElement, { attributeFilter: ["data-theme"] });

    return () => {
      cancelled = true;
      if (idle && "cancelIdleCallback" in window) window.cancelIdleCallback(idle);
      visibility.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", sync);
      scene?.dispose();
    };
  }, []);

  return (
    <div className={cn("hero3d-stage relative aspect-square w-full", className)} data-still={still} ref={containerRef}>
      <div aria-hidden="true" className="hero3d-glow" />
      <svg aria-hidden="true" className="hero3d-orbit" viewBox="0 0 100 100">
        <circle cx="50" cy="50" fill="none" r="48.5" stroke="currentColor" strokeDasharray="0.6 2.4" strokeWidth="0.25" />
        <circle cx="50" cy="1.5" fill="currentColor" r="1" />
      </svg>
      <canvas
        aria-label="A chessboard in play, with a gold knight at its centre"
        className="hero3d-canvas"
        data-ready={ready}
        ref={canvasRef}
        role="img"
      />
    </div>
  );
}
