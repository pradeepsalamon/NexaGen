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
  /** `video` mode: the surface component hands us the element to project. */
  registerPipVideo: (el: HTMLVideoElement | null) => void;
}

const PipContext = createContext<PipContextValue | undefined>(undefined);

const WIDTH = 360;
const HEIGHT = 232;

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
  const openingRef = useRef(false);
  // A window the user closed by hand should not be reopened by the very next
  // tab switch, or the feature turns into a popup they cannot get rid of.
  const dismissedRef = useRef(false);

  useEffect(() => setMode(detectMode()), []);

  const registerPipVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
  }, []);

  const close = useCallback(() => {
    getExistingPipWindow()?.close();
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
    const win = await requestPipWindow({
      width: WIDTH,
      height: HEIGHT,
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
        dismissedRef.current = true;
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
    const video = videoRef.current;
    const onLeave = () => setVideoActive(false);
    const onEnter = () => setVideoActive(true);
    document.addEventListener("leavepictureinpicture", onLeave);
    video?.addEventListener("leavepictureinpicture", onLeave);
    video?.addEventListener("enterpictureinpicture", onEnter);
    // Safari reports presentation-mode changes only through this event.
    video?.addEventListener("webkitpresentationmodechanged", () =>
      setVideoActive(isVideoPipActive(videoRef.current)),
    );
    return () => {
      document.removeEventListener("leavepictureinpicture", onLeave);
      video?.removeEventListener("leavepictureinpicture", onLeave);
      video?.removeEventListener("enterpictureinpicture", onEnter);
    };
  }, [mode]);

  // Chrome's automatic PiP for video calls: register this Media Session action
  // and the browser fires it itself when the user switches away from a tab that
  // is capturing camera or microphone. This is the only path that opens a mini
  // player without a click — a bare request on `visibilitychange` has no user
  // activation and is rejected. Safari has no equivalent, so there the user
  // taps the toolbar control first and the window then survives the tab switch.
  useEffect(() => {
    if (!mode || !autoEnabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaSession) return;
    try {
      navigator.mediaSession.setActionHandler(
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
        navigator.mediaSession.setActionHandler(
          "enterpictureinpicture" as MediaSessionAction,
          null,
        );
      } catch {
        /* nothing to unregister */
      }
    };
  }, [mode, autoEnabled, open]);

  // Coming back to the class tab, the floating window is just clutter.
  useEffect(() => {
    if (!mode) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      dismissedRef.current = false;
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
