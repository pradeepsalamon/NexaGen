// Chessboard move sounds (AUDIT H5). A minimal WebAudio implementation backed
// by short cues in `public/sounds/<themeId>/`. Theme/volume/enabled are
// driven from the chess-appearance resolver (see `useSoundSettingsSync`) —
// this module itself is a plain, non-React side-effect surface so
// `createBoardStore.ts` can call `playSound` without depending on React.

export type SoundType = "move" | "capture" | "check" | "gameEnd";

const SOUND_THEME_EXTENSIONS: Record<string, string> = {
  "nexa-classic": "wav",
};
const DEFAULT_EXTENSION = "mp3";

/** Public so a theme picker can build a preview URL without its own copy of the extension map. */
export function getSoundUrl(themeId: string, type: SoundType): string {
  const ext = SOUND_THEME_EXTENSIONS[themeId] ?? DEFAULT_EXTENSION;
  return `/sounds/${themeId}/${type}.${ext}`;
}

let themeId = "nexa-classic";
let enabled = true;
let volume = 0.8;

let ctx: AudioContext | null = null;
// Keyed by `${themeId}:${type}` so switching themes doesn't reuse a stale buffer.
const buffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function loadBuffer(theme: string, type: SoundType): Promise<AudioBuffer | null> {
  const key = `${theme}:${type}`;
  const cached = buffers.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const audioCtx = getContext();
  if (!audioCtx) return Promise.resolve(null);

  const promise = fetch(getSoundUrl(theme, type))
    .then((res) => {
      if (!res.ok) throw new Error(`sound ${key}: ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => audioCtx.decodeAudioData(data))
    .then((buf) => {
      buffers.set(key, buf);
      inflight.delete(key);
      return buf;
    })
    .catch((err) => {
      inflight.delete(key);
      console.warn("Failed to load board sound", key, err);
      return null;
    });

  inflight.set(key, promise);
  return promise;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function setSoundVolume(value: number) {
  volume = Math.min(1, Math.max(0, value));
}

/** Switches the active theme and warms its buffers. Safe to call repeatedly. */
export function setSoundTheme(nextThemeId: string) {
  if (nextThemeId === themeId) return;
  themeId = nextThemeId;
  preloadSounds();
}

export function playSound(type: SoundType) {
  if (typeof window === "undefined" || !enabled) return;

  const audioCtx = getContext();
  if (!audioCtx) return;

  const start = (buf: AudioBuffer | null) => {
    if (!buf || !enabled) return;
    try {
      if (audioCtx.state === "suspended") void audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = buf;
      const gain = audioCtx.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(audioCtx.destination);
      source.start(0);
    } catch (err) {
      console.warn("Failed to play board sound", type, err);
    }
  };

  const ready = buffers.get(`${themeId}:${type}`);
  if (ready) start(ready);
  else void loadBuffer(themeId, type).then(start);
}

/** Warm the current theme's buffer cache (call after the board mounts, or on theme change). */
export function preloadSounds() {
  if (typeof window === "undefined") return;
  (["move", "capture", "check", "gameEnd"] as SoundType[]).forEach((t) => void loadBuffer(themeId, t));
}
