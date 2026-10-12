"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { LocalVideoTrack } from "livekit-client";
import { toast } from "sonner";
import {
  canRunVideoEffects,
  hasActiveEffect,
  loadVideoEffects,
  prepareCustomBackground,
  saveCustomBackground,
  saveVideoEffects,
  type VideoBackground,
  type VideoEffectsPrefs,
} from "../lib/videoEffects/prefs";
import type { CameraEffectsProcessor } from "../lib/videoEffects/processor";

/**
 * Owns the local camera's video effects (virtual background + auto-framing)
 * for the whole class: restores the saved choice when the camera is
 * published, keeps one processor on the camera track, and swaps effects on it
 * live. Everyone in the class (and the recording) sees the processed video.
 *
 * The processor module (MediaPipe) is imported only when an effect is on.
 */

export type VideoEffectsStatus = "idle" | "loading" | "active" | "error";

interface VideoEffectsContextValue {
  prefs: VideoEffectsPrefs;
  setAutoFraming: (on: boolean) => void;
  setBackground: (background: VideoBackground) => void;
  /** Resizes + stores an uploaded picture and switches to it. */
  setCustomImage: (file: File) => Promise<void>;
  status: VideoEffectsStatus;
  /** `null` until the browser has been checked (client only). */
  supported: boolean | null;
}

const VideoEffectsContext = createContext<VideoEffectsContextValue | null>(null);

export function useVideoEffects() {
  return useContext(VideoEffectsContext);
}

type ProcessorModule = typeof import("../lib/videoEffects/processor");

let processorModule: Promise<ProcessorModule> | null = null;
function loadProcessorModule() {
  processorModule ??= import("../lib/videoEffects/processor").catch((error) => {
    processorModule = null;
    throw error;
  });
  return processorModule;
}

export function VideoEffectsProvider({ children }: { children: ReactNode }) {
  const { cameraTrack } = useLocalParticipant();
  const track = cameraTrack?.track instanceof LocalVideoTrack ? cameraTrack.track : undefined;

  const [prefs, setPrefs] = useState<VideoEffectsPrefs>(loadVideoEffects);
  const [status, setStatus] = useState<VideoEffectsStatus>("idle");
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(canRunVideoEffects()), []);

  /** The processor and the track it is attached to. */
  const attached = useRef<{ processor: CameraEffectsProcessor; track: LocalVideoTrack } | null>(null);
  /** Effects changes run one at a time, in order. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const wanted = hasActiveEffect(prefs);
    queue.current = queue.current.then(async () => {
      const current = attached.current;
      try {
        // Track gone or replaced: the old processor went with it.
        if (current && current.track !== track) attached.current = null;

        if (!track || !wanted) {
          if (attached.current && attached.current.track === track && track) {
            await track.stopProcessor();
          }
          attached.current = null;
          setStatus("idle");
          return;
        }

        if (attached.current) {
          await attached.current.processor.apply(prefs);
          setStatus("active");
          return;
        }

        if (!canRunVideoEffects()) {
          setStatus("error");
          return;
        }
        setStatus("loading");
        const m = await loadProcessorModule();
        if (!m.isVideoEffectsSupported()) {
          setSupported(false);
          setStatus("error");
          return;
        }
        const processor = m.createCameraEffectsProcessor(prefs, {
          onFramingUnavailable: () =>
            toast.error("Auto-framing couldn't start", {
              description: "Face detection didn't load. Check your connection and try again.",
              id: "video-effects-framing",
            }),
          onSlow: () =>
            toast.warning("Video effects are slowing your camera", {
              description: "This device is struggling. Turn effects off in Settings for smoother video.",
              duration: 8000,
              id: "video-effects-slow",
            }),
        });
        await track.setProcessor(processor);
        attached.current = { processor, track };
        setStatus("active");
      } catch (error) {
        console.error("Video effects failed:", error);
        attached.current = null;
        setStatus("error");
        toast.error("Couldn't apply video effects", {
          description: "Your camera is still on without them.",
          id: "video-effects-error",
        });
        await track?.stopProcessor().catch(() => undefined);
      }
    });
  }, [prefs, track]);

  const update = useCallback((patch: Partial<VideoEffectsPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveVideoEffects(next);
      return next;
    });
  }, []);

  const setBackground = useCallback((background: VideoBackground) => update({ background }), [update]);
  const setAutoFraming = useCallback((autoFraming: boolean) => update({ autoFraming }), [update]);

  const setCustomImage = useCallback(
    async (file: File) => {
      const dataUrl = await prepareCustomBackground(file);
      if (!saveCustomBackground(dataUrl)) {
        throw new Error("This browser couldn't store the image. Try a smaller picture.");
      }
      // A new prefs object even when it was already "custom": the effect re-applies
      // and the processor sees a different image URL.
      setPrefs((prev) => {
        const next: VideoEffectsPrefs = { ...prev, background: { type: "custom" } };
        saveVideoEffects(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo<VideoEffectsContextValue>(
    () => ({ prefs, setAutoFraming, setBackground, setCustomImage, status, supported }),
    [prefs, setAutoFraming, setBackground, setCustomImage, status, supported],
  );

  return <VideoEffectsContext.Provider value={value}>{children}</VideoEffectsContext.Provider>;
}
