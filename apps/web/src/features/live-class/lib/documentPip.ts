/**
 * Document Picture-in-Picture — the API behind Google Meet's floating mini
 * player. It opens a real always-on-top browser window whose document we render
 * into, so unlike `<video>.requestPictureInPicture()` it can carry controls and
 * chrome, not just pixels.
 *
 * Chromium 116+ only (Chrome / Edge / Opera). Everything here degrades to a
 * no-op elsewhere and callers must treat the feature as optional.
 */

export interface DocumentPipOptions {
  width?: number;
  height?: number;
  /** Hides Chrome's "back to tab" button when we render our own. */
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPicture extends EventTarget {
  readonly window: Window | null;
  requestWindow(options?: DocumentPipOptions): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
  /** Safari's pre-standard PiP, still the only path on iPhone / iPad. */
  interface HTMLVideoElement {
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: "inline" | "picture-in-picture") => void;
    webkitPresentationMode?: string;
  }
}

export function isDocumentPipSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/**
 * The cross-browser floor: standard `<video>` Picture-in-Picture. Safari and
 * Chromium both have it; Firefox's PiP is user-driven chrome with no scriptable
 * API, so it reports false here — and if Firefox ever ships the standard one,
 * this detection picks it up with no code change.
 */
export function isVideoPipSupported(): boolean {
  if (typeof document === "undefined") return false;
  if (document.pictureInPictureEnabled) return true;
  // iOS Safari exposes no `pictureInPictureEnabled` but does support the
  // WebKit presentation-mode API on video elements.
  const probe = document.createElement("video");
  return typeof probe.webkitSupportsPresentationMode === "function";
}

/** Puts one video element into PiP, standard API first, WebKit second. */
export async function enterVideoPip(video: HTMLVideoElement): Promise<boolean> {
  if (typeof video.requestPictureInPicture === "function" && document.pictureInPictureEnabled) {
    await video.requestPictureInPicture();
    return true;
  }
  if (video.webkitSupportsPresentationMode?.("picture-in-picture")) {
    video.webkitSetPresentationMode?.("picture-in-picture");
    return true;
  }
  return false;
}

export function exitVideoPip(video: HTMLVideoElement | null) {
  try {
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture();
      return;
    }
    if (video?.webkitPresentationMode === "picture-in-picture") {
      video.webkitSetPresentationMode?.("inline");
    }
  } catch {
    /* already out */
  }
}

export function isVideoPipActive(video: HTMLVideoElement | null): boolean {
  if (typeof document === "undefined") return false;
  if (document.pictureInPictureElement) return true;
  return video?.webkitPresentationMode === "picture-in-picture";
}

export function getExistingPipWindow(): Window | null {
  return (typeof window !== "undefined" && window.documentPictureInPicture?.window) || null;
}

export async function requestPipWindow(options: DocumentPipOptions): Promise<Window | null> {
  if (!isDocumentPipSupported()) return null;
  return (await window.documentPictureInPicture!.requestWindow(options)) ?? null;
}

/**
 * The PiP window starts with an empty document — it inherits nothing from the
 * opener — so every stylesheet has to be carried across by hand or the portal
 * renders as unstyled HTML.
 *
 * Same-origin sheets (Tailwind's bundle, Next's injected dev styles) are copied
 * rule by rule; cross-origin ones (Google Fonts) throw on `cssRules`, so those
 * are re-linked by href instead.
 */
export function copyStylesTo(pipWindow: Window) {
  const doc = pipWindow.document;

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      const style = doc.createElement("style");
      style.textContent = Array.from(rules)
        .map((rule) => rule.cssText)
        .join("\n");
      if (sheet.media?.mediaText) style.media = sheet.media.mediaText;
      doc.head.appendChild(style);
    } catch {
      const owner = sheet.ownerNode as HTMLLinkElement | null;
      if (!owner?.href) continue;
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = owner.href;
      if (sheet.media?.mediaText) link.media = sheet.media.mediaText;
      doc.head.appendChild(link);
    }
  }
}

/**
 * Mirrors the app's `data-theme` (and the base page colours) into the PiP
 * document, then keeps them in sync — the theme toggle lives in the main
 * window and its attribute change would otherwise never reach this one.
 *
 * Returns a teardown for the observer.
 */
export function syncThemeTo(pipWindow: Window): () => void {
  const apply = () => {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) pipWindow.document.documentElement.setAttribute("data-theme", theme);
    else pipWindow.document.documentElement.removeAttribute("data-theme");
  };
  apply();

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-theme", "class"],
  });
  return () => observer.disconnect();
}
