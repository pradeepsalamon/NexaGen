"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  copyStylesTo,
  enterVideoPip,
  exitVideoPip,
  getExistingPipWindow,
  isDocumentPipSupported,
  isVideoPipActive,
  isVideoPipSupported,
  requestPipWindow,
  syncThemeTo,
} from "../lib/documentPip";

/**
 * Which floating-window mechanism this browser gave us.
 *
 * - `document` — Document Picture-in-Picture (Chromium 116+). A real window we
 *   render DOM into, so it carries the name pill and mic / camera / back
 *   controls.
 * - `video`    — standard `<video>` Picture-in-Picture (Safari, and Chromium as
 *   a fallback). Picture only: the browser draws its own frame and the page
 *   cannot put controls inside it.
 * - `null`     — nothing scriptable (Firefox, whose PiP is user-driven chrome).
 */
export type PipMode = "document" | "video" | null;

interface PipContextValue {
  mode: PipMode;
  supported: boolean;
  /** True only in `document` mode — portal into `pipWindow.document.body`. */
  pipWindow: Window | null;
  /** True whenever a mini player is showing, whichever mechanism is in use. */
  active: boolean;
  open: () => Promise<void>;
  close: () => void;
  toggle: () => void;
  /** Pinned: the window stays open after returning to the class tab. */
  pinned: boolean;
  togglePinned: () => void;
  /** `document` mode: steps the window through the size presets. */
  cycleSize: () => void;
  /** `video` mode: the surface component hands us the element to project. */
  registerPipVideo: (el: HTMLVideoElement | null) => void;
}

const PipContext = createContext<PipContextValue | undefined>(undefined);

const SIZES = [
  { width: 360, height: 232 },
  { width: 480, height: 300 },
  { width: 640, height: 392 },
] as const;
const SIZE_KEY = "nexa-live-class-pip-size";
const PINNED_KEY = "nexa-live-class-pip-pinned";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked — the choice just isn't remembered */
  }
}

function detectMode(): PipMode {
  if (isDocumentPipSupported()) return "document";
  if (isVideoPipSupported()) return "video";
  return null;
}

export function PipProvider({
  children,
  /** Auto-open on tab switch only while the class is actually running. */
  autoEnabled = true,
}: {
  children: ReactNode;
  autoEnabled?: boolean;
}) {
  // Detected lazily on the client: SSR has neither `window` nor `document`, and
  // a wrong first guess would hydrate a toolbar row that then disappears.
  const [mode, setMode] = useState<PipMode>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [videoActive, setVideoActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Mirrors videoRef as state so the listener effect re-runs for a new element.
  const [pipVideo, setPipVideo] = useState<HTMLVideoElement | null>(null);
  const openingRef = useRef(false);
  // A window the user closed by hand should not be reopened by the very next
  // tab switch, or the feature turns into a popup they cannot get rid of.
  const dismissedRef = useRef(false);
  // Set while we close the window ourselves, so its pagehide isn't read as the
  // user dismissing it (that blocked every second auto-open).
  const closingRef = useRef(false);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  const sizeIndexRef = useRef(0);

  useEffect(() => {
    setMode(detectMode());
    const storedPinned = readStored(PINNED_KEY) === "1";
    pinnedRef.current = storedPinned;
    setPinned(storedPinned);
    const storedSize = Number(readStored(SIZE_KEY));
    if (Number.isInteger(storedSize) && storedSize >= 0 && storedSize < SIZES.length) {
      sizeIndexRef.current = storedSize;
    }
  }, []);

  const togglePinned = useCallback(() => {
    const next = !pinnedRef.current;
    pinnedRef.current = next;
    setPinned(next);
    writeStored(PINNED_KEY, next ? "1" : "0");
  }, []);

  const registerPipVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setPipVideo(el);
  }, []);

  const close = useCallback(() => {
    const win = getExistingPipWindow();
    if (win) {
      closingRef.current = true;
      win.close();
    }
    setPipWindow(null);
    exitVideoPip(videoRef.current);
    setVideoActive(false);
  }, []);

  const openDocumentPip = useCallback(async () => {
    const existing = getExistingPipWindow();
    if (existing) {
      setPipWindow(existing);
      return;
    }
    const size = SIZES[sizeIndexRef.current] ?? SIZES[0];
    const win = await requestPipWindow({
      width: size.width,
      height: size.height,
      disallowReturnToOpener: false,
    });
    if (!win) return;

    copyStylesTo(win);
    const stopThemeSync = syncThemeTo(win);
    win.document.body.style.margin = "0";
    win.document.body.style.overflow = "hidden";

    win.addEventListener(
      "pagehide",
      () => {
        stopThemeSync();
        // Only a window the user closed while away from the class counts as
        // "don't reopen". Our own close and Chrome closing its auto-PiP when
        // the tab comes back both happen while the tab is visible.
        if (!closingRef.current && document.visibilityState === "hidden") {
          dismissedRef.current = true;
        }
        closingRef.current = false;
        setPipWindow(null);
      },
      { once: true },
    );

    setPipWindow(win);
  }, []);

  const openVideoPip = useCallback(async () => {
    const video = videoRef.current;
    // The surface mounts the element and only fills it once a track is
    // available; without a live frame `requestPictureInPicture` rejects.
    if (!video || video.readyState === 0) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        /* autoplay policies — muted playback should not hit this */
      }
    }
    const entered = await enterVideoPip(video);
    setVideoActive(entered);
  }, []);

  const open = useCallback(async () => {
    if (!mode || openingRef.current) return;
    openingRef.current = true;
    try {
      if (mode === "document") await openDocumentPip();
      else await openVideoPip();
    } catch {
      // Rejected because the browser wanted a user gesture, or the user
      // dismissed the request. Either way there is nothing to recover.
    } finally {
      openingRef.current = false;
    }
  }, [mode, openDocumentPip, openVideoPip]);

  const active = !!pipWindow || videoActive;

  const cycleSize = useCallback(() => {
    const win = getExistingPipWindow();
    if (!win) return;
    const next = (sizeIndexRef.current + 1) % SIZES.length;
    sizeIndexRef.current = next;
    writeStored(SIZE_KEY, String(next));
    try {
      // Needs a user gesture inside the PiP window — the size button is one.
      win.resizeTo(SIZES[next].width, SIZES[next].height);
    } catch {
      /* resize refused — the user can still drag the window's edges */
    }
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      dismissedRef.current = true;
      close();
    } else {
      dismissedRef.current = false;
      void open();
    }
  }, [active, close, open]);

  // Track PiP exits the browser drives itself (the window's own close button).
  useEffect(() => {
    if (mode !== "video") return;
    const video = pipVideo;
    const onLeave = () => setVideoActive(false);
    const onEnter = () => setVideoActive(true);
    // Safari reports presentation-mode changes only through this event.
    const onPresentationMode = () => setVideoActive(isVideoPipActive(video));
    document.addEventListener("leavepictureinpicture", onLeave);
    video?.addEventListener("leavepictureinpicture", onLeave);
    video?.addEventListener("enterpictureinpicture", onEnter);
    video?.addEventListener("webkitpresentationmodechanged", onPresentationMode);
    return () => {
      document.removeEventListener("leavepictureinpicture", onLeave);
      video?.removeEventListener("leavepictureinpicture", onLeave);
      video?.removeEventListener("enterpictureinpicture", onEnter);
      video?.removeEventListener("webkitpresentationmodechanged", onPresentationMode);
    };
  }, [mode, pipVideo]);

  // Chrome's automatic PiP for video calls: register this Media Session action
  // and the browser fires it itself when the user switches away from the tab.
  // This is the only path that opens a mini player without a click — a bare
  // request on `visibilitychange` has no user activation and is rejected.
  //
  // Chrome only offers automatic PiP to a tab that is actively capturing camera
  // or microphone — `PipMicCaptureBridge` holds a muted mic open for exactly
  // this reason. The metadata / `playing` state here just make the session look
  // real so the action is delivered. Safari has no equivalent, so there the
  // user taps the toolbar control once and the window survives the tab switch.
  useEffect(() => {
    if (!mode || !autoEnabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaSession) return;

    const session = navigator.mediaSession;

    try {
      session.metadata = new MediaMetadata({ title: "Live class", artist: "Nexa Chess" });
      session.playbackState = "playing";
    } catch {
      /* MediaMetadata / playbackState unsupported — the capture path still works */
    }

    try {
      session.setActionHandler(
        "enterpictureinpicture" as MediaSessionAction,
        () => {
          if (dismissedRef.current) return;
          void open();
        },
      );
    } catch {
      // Older Chromium without the action — the manual control still works.
      return;
    }

    return () => {
      try {
        session.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        /* nothing to unregister */
      }
      try {
        session.playbackState = "none";
        session.metadata = null;
      } catch {
        /* nothing to reset */
      }
    };
  }, [mode, autoEnabled, open]);

  // Coming back to the class tab, the floating window is just clutter.
  useEffect(() => {
    if (!mode) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      dismissedRef.current = false;
      if (pinnedRef.current) return;
      if (getExistingPipWindow() || isVideoPipActive(videoRef.current)) close();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mode, close]);

  // Never leave an orphaned window behind when the meeting unmounts.
  useEffect(
    () => () => {
      getExistingPipWindow()?.close();
      exitVideoPip(videoRef.current);
    },
    [],
  );

  return (
    <PipContext.Provider
      value={{
        mode,
        supported: mode !== null,
        pipWindow,
        active,
        open,
        close,
        toggle,
        pinned,
        togglePinned,
        cycleSize,
        registerPipVideo,
      }}
    >
      {children}
    </PipContext.Provider>
  );
}

export function usePip(): PipContextValue {
  const ctx = useContext(PipContext);
  if (!ctx) throw new Error("usePip must be used within a <PipProvider>");
  return ctx;
}

export function useOptionalPip() {
  return useContext(PipContext);
}
