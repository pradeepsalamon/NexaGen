/**
 * Camera effects a participant picks for themselves: a virtual background
 * (blur or an image) and auto-framing. Saved per browser in `localStorage`,
 * like the device picks in `lib/mediaDevices.ts` — never sent to the API.
 *
 * Kept free of MediaPipe / track-processor imports: those are ~1 MB and are
 * loaded on demand (`./processor`) only once someone actually turns an
 * effect on.
 */

export type VideoBackground =
  | { type: "none" }
  | { radius: number; type: "blur" }
  | { id: string; type: "image" }
  | { type: "custom" };

export interface VideoEffectsPrefs {
  background: VideoBackground;
  /** Keep the speaker centred and zoomed in on their face. */
  autoFraming: boolean;
}

export interface BackgroundPreset {
  id: string;
  label: string;
  src: string;
  thumb: string;
}

const preset = (id: string, label: string): BackgroundPreset => ({
  id,
  label,
  src: `/video-backgrounds/${id}.jpg`,
  thumb: `/video-backgrounds/${id}-thumb.jpg`,
});

/** Shipped images (`public/video-backgrounds`). Ids are persisted — never rename one. */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  preset("study", "Library"),
  preset("chessboard", "Chessboard"),
  preset("nexa", "Nexa blue"),
  preset("sunrise", "Sunrise"),
  preset("forest", "Forest"),
  preset("studio", "Studio"),
];

export const BLUR_LEVELS = [
  { label: "Slight blur", radius: 6 },
  { label: "Blur", radius: 14 },
] as const;

export const DEFAULT_VIDEO_EFFECTS: VideoEffectsPrefs = {
  autoFraming: false,
  background: { type: "none" },
};

const PREFS_KEY = "nexa-live-class-video-effects";
const CUSTOM_IMAGE_KEY = "nexa-live-class-video-background";

export function loadVideoEffects(): VideoEffectsPrefs {
  if (typeof window === "undefined") return DEFAULT_VIDEO_EFFECTS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_VIDEO_EFFECTS;
    const parsed = JSON.parse(raw) as Partial<VideoEffectsPrefs>;
    const background = parsed.background;
    const valid =
      background &&
      (background.type === "none" ||
        (background.type === "blur" && typeof background.radius === "number") ||
        (background.type === "image" && BACKGROUND_PRESETS.some((p) => p.id === background.id)) ||
        (background.type === "custom" && !!loadCustomBackground()));
    return {
      autoFraming: parsed.autoFraming === true,
      background: valid ? background : DEFAULT_VIDEO_EFFECTS.background,
    };
  } catch {
    return DEFAULT_VIDEO_EFFECTS;
  }
}

export function saveVideoEffects(prefs: VideoEffectsPrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked — the choice just won't survive a reload.
  }
}

export function loadCustomBackground(): string | null {
  try {
    return window.localStorage.getItem(CUSTOM_IMAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store it (quota / private mode). */
export function saveCustomBackground(dataUrl: string): boolean {
  try {
    window.localStorage.setItem(CUSTOM_IMAGE_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

/** URL of the image a background draws, or `undefined` for none / blur. */
export function backgroundImageSrc(background: VideoBackground): string | undefined {
  if (background.type === "image") {
    return BACKGROUND_PRESETS.find((p) => p.id === background.id)?.src;
  }
  if (background.type === "custom") return loadCustomBackground() ?? undefined;
  return undefined;
}

/**
 * Same capability test as `@livekit/track-processors`' `supportsBackgroundProcessors`,
 * without importing it: WebGL2 + VideoFrame + OffscreenCanvas, and either
 * insertable streams or `canvas.captureStream`.
 */
export function canRunVideoEffects(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const transformer =
      typeof OffscreenCanvas !== "undefined" &&
      typeof VideoFrame !== "undefined" &&
      typeof createImageBitmap !== "undefined" &&
      !!document.createElement("canvas").getContext("webgl2");
    const pipeline =
      "MediaStreamTrackProcessor" in window ||
      (typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype);
    return transformer && pipeline;
  } catch {
    return false;
  }
}

export function hasActiveEffect(prefs: VideoEffectsPrefs) {
  return prefs.autoFraming || prefs.background.type !== "none";
}

export function sameBackground(a: VideoBackground, b: VideoBackground) {
  if (a.type !== b.type) return false;
  if (a.type === "blur" && b.type === "blur") return a.radius === b.radius;
  if (a.type === "image" && b.type === "image") return a.id === b.id;
  return true;
}

/**
 * Scales an uploaded picture down to 1280×720 (cover) and re-encodes it as a
 * JPEG data URL — small enough for `localStorage`, big enough for a 720p camera.
 */
export async function prepareCustomBackground(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPG, PNG or WebP).");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is larger than 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const W = 1280;
    const H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    const scale = Math.max(W / bitmap.width, H / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (W - w) / 2, (H - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}
