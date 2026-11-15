import { createThemeRevealFx } from "./themeRevealFx";

/** Where the reveal grows from, in viewport pixels. */
export type ThemeRevealOrigin = { x: number; y: number };

/** The centre of the control that was used, so a keyboard press works like a click. */
export function revealOriginOf(element: Element): ThemeRevealOrigin {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

type ViewTransitionLike = {
  finished: Promise<void>;
  ready: Promise<void>;
  skipTransition: () => void;
};
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

export const THEME_REVEAL_MS = 700;
// Starts moving on the click and settles slowly at the far corner.
const EASING: [number, number, number, number] = [0.4, 0, 0.2, 1];

let running: ViewTransitionLike | null = null;

/**
 * Switches the theme behind a circle growing from `origin`.
 *
 * The browser keeps a picture of the old theme (View Transitions API), `commit`
 * swaps the palette once, and only the circle's clip is animated: the page is
 * styled and painted one time, not once per frame. Without an origin, without
 * the API, with reduced motion, in a hidden tab or while a reveal is already
 * running, `commit` runs at once with no animation.
 *
 * `commit` may run a frame later than this call and must apply the latest
 * requested theme, not one captured when it was created.
 */
export function runThemeReveal(origin: ThemeRevealOrigin | undefined, commit: () => void): void {
  const doc = document as ViewTransitionDocument;
  const root = document.documentElement;

  if (
    !origin ||
    running ||
    typeof doc.startViewTransition !== "function" ||
    document.visibilityState !== "visible" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    running?.skipTransition();
    commit();
    return;
  }

  const { x, y } = origin;
  const maxRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const fx = createThemeRevealFx();

  root.dataset.themeReveal = "";
  const transition = doc.startViewTransition(commit);
  running = transition;

  transition.ready
    .then(() => {
      const circle = (radius: number) => `circle(${radius}px at ${x}px ${y}px)`;
      const reveal = root.animate(
        { clipPath: [circle(0), circle(maxRadius)] },
        {
          duration: THEME_REVEAL_MS,
          easing: `cubic-bezier(${EASING.join(",")})`,
          fill: "both",
          pseudoElement: "::view-transition-new(root)"
        }
      );
      const ease = cubicBezier(...EASING);
      fx?.play({
        getProgress: () => ease(Number(reveal.currentTime ?? 0) / THEME_REVEAL_MS),
        maxRadius,
        x,
        y
      });
    })
    .catch(() => {
      // Skipped by the browser or by a second click; the theme is already applied.
      fx?.dispose();
    });

  void transition.finished
    .catch(() => undefined)
    .then(() => {
      if (running === transition) {
        running = null;
        delete root.dataset.themeReveal;
      }
    });
}

/** The same curve CSS uses, so the ring stays on the edge of the circle. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 20; i += 1) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-4) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sampleY(t);
  };
}
