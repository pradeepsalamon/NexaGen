// Chessboard move sounds (AUDIT H5). Previously both functions were empty stubs
// and no assets existed, so the whole compute-moveType → broadcast → play chain
// was dead. This is a minimal WebAudio implementation backed by short WAV cues
// in `public/sounds/`.

import { useBoardStore as usePersistedBoardStore } from "../store/boardStore";

export type SoundType = "move" | "capture" | "check" | "gameEnd";

const SOUND_FILES: Record<SoundType, string> = {
  move: "/sounds/move.wav",
  capture: "/sounds/capture.wav",
  check: "/sounds/check.wav",
  gameEnd: "/sounds/gameEnd.wav",
};

// Local mirror of the persisted `soundEnabled` preference. `boardStore`'s
// `toggleSound` calls `setSoundEnabled`; we also read the persisted store
// directly on first use so a page load starts in the right state.
let enabled = true;
let hydratedFromStore = false;

let ctx: AudioContext | null = null;
const buffers = new Map<SoundType, AudioBuffer>();
const inflight = new Map<SoundType, Promise<AudioBuffer | null>>();

function hydrateEnabledOnce() {
  if (hydratedFromStore || typeof window === "undefined") return;
  hydratedFromStore = true;
  try {
    const persisted = usePersistedBoardStore.getState().soundEnabled;
    if (typeof persisted === "boolean") enabled = persisted;
  } catch {
    // store not available (SSR / test) — keep the default
  }
}

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

async function loadBuffer(type: SoundType): Promise<AudioBuffer | null> {
  const cached = buffers.get(type);
  if (cached) return cached;

  const existing = inflight.get(type);
  if (existing) return existing;

  const audioCtx = getContext();
  if (!audioCtx) return null;

  const promise = fetch(SOUND_FILES[type])
    .then((res) => {
      if (!res.ok) throw new Error(`sound ${type}: ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => audioCtx.decodeAudioData(data))
    .then((buf) => {
      buffers.set(type, buf);
      inflight.delete(type);
      return buf;
    })
    .catch((err) => {
      inflight.delete(type);
      console.warn("Failed to load board sound", type, err);
      return null;
    });

  inflight.set(type, promise);
  return promise;
}

export function setSoundEnabled(value: boolean) {
  hydratedFromStore = true;
  enabled = value;
}

export function playSound(type: SoundType) {
  if (typeof window === "undefined") return;
  hydrateEnabledOnce();
  if (!enabled) return;

  const audioCtx = getContext();
  if (!audioCtx) return;

  const start = (buf: AudioBuffer | null) => {
    if (!buf || !enabled) return;
    try {
      if (audioCtx.state === "suspended") void audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = buf;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.8;
      source.connect(gain).connect(audioCtx.destination);
      source.start(0);
    } catch (err) {
      console.warn("Failed to play board sound", type, err);
    }
  };

  const ready = buffers.get(type);
  if (ready) start(ready);
  else void loadBuffer(type).then(start);
}

/** Warm the buffer cache (call after the board mounts). Safe to call repeatedly. */
export function preloadSounds() {
  if (typeof window === "undefined") return;
  (Object.keys(SOUND_FILES) as SoundType[]).forEach((t) => void loadBuffer(t));
}
