/**
 * Auto-framing maths (Zoom / Center Stage style): given the faces a detector
 * found in a camera frame, choose the crop that keeps them centred with
 * head-and-shoulders room, and glide the visible crop towards it.
 *
 * Pure and allocation-light — it runs once per camera frame.
 */

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FramingOptions {
  /** Deepest zoom allowed, as a fraction of the frame height (0.5 ⇒ at most 2×). */
  minCropFraction: number;
  /** Crop height as a multiple of the face height — room for shoulders and hands. */
  faceHeightRatio: number;
  /** Where the face centre sits from the top of the crop (0.5 = dead centre). */
  faceAnchorY: number;
  /** Ignore movements smaller than this fraction of the crop, so the frame doesn't twitch. */
  deadZone: number;
  /** Time constant of the glide towards a new target, ms. */
  smoothingMs: number;
  /** No face for this long ⇒ zoom back out to the whole frame. */
  lostFaceResetMs: number;
}

export const DEFAULT_FRAMING_OPTIONS: FramingOptions = {
  deadZone: 0.08,
  faceAnchorY: 0.4,
  faceHeightRatio: 3.4,
  lostFaceResetMs: 2500,
  minCropFraction: 0.5,
  smoothingMs: 450,
};

export function fullFrame(width: number, height: number): Rect {
  return { height, width, x: 0, y: 0 };
}

/** Smallest rect containing every box; `null` for none. */
export function unionRects(boxes: Rect[]): Rect | null {
  if (boxes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { height: y1 - y0, width: x1 - x0, x: x0, y: y0 };
}

/**
 * The ideal crop for these faces in a `frameW × frameH` frame. Always the
 * frame's own aspect ratio (the output keeps the camera's resolution) and
 * always inside the frame.
 */
export function targetCrop(
  faces: Rect,
  frameW: number,
  frameH: number,
  opts: FramingOptions = DEFAULT_FRAMING_OPTIONS,
): Rect {
  const aspect = frameW / frameH;
  let height = faces.height * opts.faceHeightRatio;
  // Several people side by side: make the crop wide enough for all of them.
  height = Math.max(height, (faces.width * 1.5) / aspect);
  height = Math.min(frameH, Math.max(frameH * opts.minCropFraction, height));
  const width = height * aspect;

  const cx = faces.x + faces.width / 2;
  const cy = faces.y + faces.height / 2 + height * (0.5 - opts.faceAnchorY);
  return clampRect({ height, width, x: cx - width / 2, y: cy - height / 2 }, frameW, frameH);
}

export function clampRect(rect: Rect, frameW: number, frameH: number): Rect {
  const width = Math.min(rect.width, frameW);
  const height = Math.min(rect.height, frameH);
  return {
    height,
    width,
    x: Math.min(Math.max(0, rect.x), frameW - width),
    y: Math.min(Math.max(0, rect.y), frameH - height),
  };
}

/** True when `next` differs from `current` by more than the dead zone. */
export function exceedsDeadZone(current: Rect, next: Rect, deadZone: number): boolean {
  const dx = Math.abs(current.x + current.width / 2 - (next.x + next.width / 2)) / current.width;
  const dy = Math.abs(current.y + current.height / 2 - (next.y + next.height / 2)) / current.height;
  const ds = Math.abs(current.height - next.height) / current.height;
  return dx > deadZone || dy > deadZone || ds > deadZone * 1.5;
}

/** Exponential glide from `current` towards `target` over `dtMs`. */
export function stepTowards(current: Rect, target: Rect, dtMs: number, smoothingMs: number): Rect {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, smoothingMs));
  return {
    height: current.height + (target.height - current.height) * k,
    width: current.width + (target.width - current.width) * k,
    x: current.x + (target.x - current.x) * k,
    y: current.y + (target.y - current.y) * k,
  };
}

/**
 * Stateful framer: feed it detections when you have them and ask it for the
 * crop on every frame.
 */
export class AutoFramer {
  private current: Rect | null = null;
  private target: Rect | null = null;
  private lastFaceAt = 0;
  private lastStepAt = 0;
  private frameW = 0;
  private frameH = 0;

  constructor(private readonly opts: FramingOptions = DEFAULT_FRAMING_OPTIONS) {}

  /** Record the faces found in the latest analysed frame (empty = none). */
  observe(faces: Rect[], frameW: number, frameH: number, now: number) {
    this.resize(frameW, frameH);
    const union = unionRects(faces);
    if (union) {
      this.lastFaceAt = now;
      const next = targetCrop(union, frameW, frameH, this.opts);
      if (!this.target || exceedsDeadZone(this.target, next, this.opts.deadZone)) {
        this.target = next;
      }
    } else if (now - this.lastFaceAt > this.opts.lostFaceResetMs) {
      this.target = fullFrame(frameW, frameH);
    }
  }

  /** The crop to draw this frame. */
  crop(frameW: number, frameH: number, now: number): Rect {
    this.resize(frameW, frameH);
    const target = this.target ?? fullFrame(frameW, frameH);
    const current = this.current ?? fullFrame(frameW, frameH);
    const dt = this.lastStepAt ? now - this.lastStepAt : 0;
    this.lastStepAt = now;
    this.current = clampRect(stepTowards(current, target, dt, this.opts.smoothingMs), frameW, frameH);
    return this.current;
  }

  reset() {
    this.current = null;
    this.target = null;
    this.lastFaceAt = 0;
    this.lastStepAt = 0;
  }

  /** A resolution change (rotation, camera switch) invalidates every rect. */
  private resize(frameW: number, frameH: number) {
    if (frameW === this.frameW && frameH === this.frameH) return;
    this.frameW = frameW;
    this.frameH = frameH;
    this.reset();
  }
}
