/**
 * The gold ring and sparks that ride the edge of the theme reveal. One canvas,
 * created for the reveal and removed when the last spark fades, so nothing
 * stays in the page between switches.
 */

type PlayOptions = {
  /** Eased reveal progress, 0..1. */
  getProgress: () => number;
  maxRadius: number;
  x: number;
  y: number;
};

export type ThemeRevealFx = {
  dispose: () => void;
  play: (options: PlayOptions) => void;
};

type Spark = {
  age: number;
  drag: number;
  life: number;
  size: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const TAU = Math.PI * 2;
const MAX_SPARKS = 140;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Null on touch devices and small machines: there the reveal is the plain circle. */
export function createThemeRevealFx(): ThemeRevealFx | null {
  if (!window.matchMedia("(pointer: fine)").matches) return null;
  if ((navigator.hardwareConcurrency ?? 4) < 4) return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.className = "theme-reveal-fx";
  canvas.setAttribute("aria-hidden", "true");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // In the page before the browser takes its pictures, so the canvas gets its own layer above the circle.
  document.body.appendChild(canvas);

  // The gold token is the same in both themes.
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--rgb-accent").trim();
  const gold = (alpha: number) => `rgb(${accent} / ${alpha})`;

  let frame = 0;
  const dispose = () => {
    window.cancelAnimationFrame(frame);
    canvas.remove();
  };

  const play = ({ getProgress, maxRadius, x, y }: PlayOptions) => {
    const sparks: Spark[] = [];
    for (let i = 0; i < 36; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(60, 360);
      sparks.push({
        age: 0,
        drag: rand(1.6, 3.2),
        life: rand(450, 900),
        size: rand(0.8, 2.2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        x,
        y
      });
    }

    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const progress = Math.min(1, Math.max(0, getProgress()));
      const radius = progress * maxRadius;
      ctx.clearRect(0, 0, width, height);

      if (progress < 0.98 && radius > 2) {
        const fade = 1 - Math.max(0, (progress - 0.55) / 0.45);
        // Soft glow, then a crisp line on the edge itself, then two trailing ripples.
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.lineWidth = Math.min(28, 8 + radius * 0.04);
        ctx.strokeStyle = gold(0.18 * fade);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = gold(0.9 * fade);
        ctx.stroke();
        for (const [index, factor] of [0.84, 0.68].entries()) {
          ctx.beginPath();
          ctx.arc(x, y, radius * factor, 0, TAU);
          ctx.lineWidth = 1;
          ctx.strokeStyle = gold((0.26 - index * 0.1) * fade);
          ctx.stroke();
        }

        // New sparks only on the part of the edge that is on screen.
        const wanted = progress < 0.9 ? Math.round((dt / 16) * 3) : 0;
        for (let i = 0; i < wanted && sparks.length < MAX_SPARKS; i += 1) {
          const angle = rand(0, TAU);
          const px = x + Math.cos(angle) * radius;
          const py = y + Math.sin(angle) * radius;
          if (px < 0 || py < 0 || px > width || py > height) continue;
          const out = rand(10, 60);
          sparks.push({
            age: 0,
            drag: rand(0.8, 1.8),
            life: rand(350, 750),
            size: rand(0.7, 2),
            vx: Math.cos(angle) * out,
            vy: Math.sin(angle) * out - rand(0, 24),
            x: px,
            y: py
          });
        }
      }

      const seconds = dt / 1000;
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.age += dt;
        if (spark.age >= spark.life) {
          sparks.splice(i, 1);
          continue;
        }
        const damp = Math.exp(-spark.drag * seconds);
        spark.vx *= damp;
        spark.vy *= damp;
        spark.x += spark.vx * seconds;
        spark.y += spark.vy * seconds;
        const left = 1 - spark.age / spark.life;
        ctx.fillStyle = gold(0.9 * left * left);
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, TAU);
        ctx.fill();
      }

      if (progress >= 1 && sparks.length === 0) {
        dispose();
        return;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
  };

  return { dispose, play };
}
