import { MediaDeviceFailure } from "livekit-client";

/**
 * Local-only camera / microphone / speaker preferences for live classes, plus
 * the helpers every media surface (pre-join card, in-room Settings panel,
 * `MediaDeviceProvider`) shares so they agree on what a device is called and
 * what a failure means.
 *
 * Preferences live in `localStorage` — per browser, never sent to the API. A
 * device is remembered by id *and* label: browsers rotate device ids (Safari
 * per session, every browser after site data is cleared), and the label is
 * what lets "USB Headset" be found again when its id has changed.
 */

export type MediaKind = "audioinput" | "videoinput" | "audiooutput";

export const MEDIA_KINDS: MediaKind[] = ["audioinput", "videoinput", "audiooutput"];

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  audioinput: "Microphone",
  audiooutput: "Speaker",
  videoinput: "Camera",
};

export interface SavedDevice {
  deviceId: string;
  label: string;
}

export interface MediaDevicePrefs {
  audioinput?: SavedDevice;
  audiooutput?: SavedDevice;
  /** Last pre-join camera toggle — can only turn a policy default off. */
  cameraOn?: boolean;
  /** Last pre-join microphone toggle — can only turn a policy default off. */
  micOn?: boolean;
  videoinput?: SavedDevice;
}

const STORAGE_KEY = "nexa-live-class-media";

export function loadMediaPrefs(): MediaDevicePrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as MediaDevicePrefs) : {};
  } catch {
    return {};
  }
}

function writeMediaPrefs(patch: Partial<MediaDevicePrefs>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadMediaPrefs(), ...patch }));
  } catch {
    // Private mode / storage blocked — preferences just won't survive a reload.
  }
}

export function saveDevicePref(kind: MediaKind, device: SavedDevice) {
  if (!device.deviceId) return;
  writeMediaPrefs({ [kind]: { deviceId: device.deviceId, label: device.label } });
}

export function saveJoinPrefs(prefs: { cameraOn: boolean; micOn: boolean }) {
  writeMediaPrefs(prefs);
}

/**
 * Finds the saved device in a fresh enumeration: exact id first, then label
 * (the id changed but it is the same hardware). `undefined` when it is not
 * plugged in — callers leave the browser default in place.
 */
export function resolveSavedDevice(
  saved: SavedDevice | undefined,
  devices: MediaDeviceInfo[],
): MediaDeviceInfo | undefined {
  if (!saved) return undefined;
  return (
    devices.find((d) => d.deviceId === saved.deviceId) ??
    (saved.label ? devices.find((d) => d.label === saved.label) : undefined)
  );
}

export function deviceDisplayName(device: MediaDeviceInfo | undefined, kind: MediaKind, index = 0) {
  if (device?.label) return device.label;
  return `${MEDIA_KIND_LABEL[kind]} ${index + 1}`;
}

/** Camera / mic capture needs `navigator.mediaDevices`, which only exists on a secure (https / localhost) page. */
export function isMediaCaptureAvailable() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Choosing a speaker needs `setSinkId` — Chromium / Firefox 116+; Safari and iOS route output themselves. */
export function isAudioOutputSelectionSupported() {
  return (
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype
  );
}

export interface MediaErrorInfo {
  description: string;
  title: string;
}

/** Turns a getUserMedia / LiveKit device error into something a student can act on. */
export function describeMediaError(error: unknown, kind?: MediaKind): MediaErrorInfo {
  const device = kind ? MEDIA_KIND_LABEL[kind].toLowerCase() : "camera or microphone";
  const Device = device.charAt(0).toUpperCase() + device.slice(1);

  if (!isMediaCaptureAvailable()) {
    return {
      title: "Camera and microphone unavailable",
      description:
        "This browser can't access media devices on this page. Open the class over https in an up-to-date Chrome, Edge, Safari or Firefox.",
    };
  }

  const name = error instanceof Error || (error && typeof error === "object" && "name" in error)
    ? String((error as { name?: unknown }).name ?? "")
    : "";

  if (name === "OverconstrainedError") {
    return {
      title: `Saved ${device} not found`,
      description: `The ${device} you used last time isn't connected. Pick another one in Settings.`,
    };
  }
  if (name === "NotSupportedError") {
    return {
      title: `${Device} not supported`,
      description: "This browser doesn't support this device. Try Chrome, Edge or Safari.",
    };
  }

  switch (MediaDeviceFailure.getFailure(error as Error)) {
    case MediaDeviceFailure.PermissionDenied:
      return {
        title: `${Device} access blocked`,
        description: `Allow ${device} access from the lock / camera icon in the address bar (and in your system privacy settings), then try again.`,
      };
    case MediaDeviceFailure.NotFound:
      return {
        title: `No ${device} found`,
        description: `Plug in or enable a ${device}, then press "Scan devices" in Settings.`,
      };
    case MediaDeviceFailure.DeviceInUse:
      return {
        title: `${Device} is busy`,
        description: `Another app or tab (Zoom, Teams, another class tab…) is using your ${device}. Close it and try again.`,
      };
    default:
      return {
        title: `${Device} problem`,
        description:
          error instanceof Error && error.message
            ? error.message
            : `Your ${device} couldn't be started. Try another device in Settings.`,
      };
  }
}

function hasLabels(devices: MediaDeviceInfo[]) {
  return devices.length > 0 && devices.every((d) => d.label !== "");
}

async function enumerate(kind: MediaKind) {
  const all = await navigator.mediaDevices.enumerateDevices();
  const seen = new Set<string>();
  // Before permission Firefox/Safari list placeholder entries with an empty id —
  // nothing can be selected with those, so they are dropped.
  return all.filter((d) => {
    if (d.kind !== kind || !d.deviceId || seen.has(d.deviceId)) return false;
    seen.add(d.deviceId);
    return true;
  });
}

export interface ScanResult {
  devices: MediaDeviceInfo[];
  error: unknown;
}

/**
 * Lists every device of a kind. With `requestPermission`, asks for access first
 * when the browser is hiding devices behind the permission prompt (empty labels
 * / placeholder entries) — that is why "no microphone found" shows on some
 * browsers until the user grants access once. A failed prompt is returned, not
 * thrown, alongside whatever could still be listed.
 */
export async function scanMediaDevices(kind: MediaKind, requestPermission: boolean): Promise<ScanResult> {
  if (!isMediaCaptureAvailable()) {
    return { devices: [], error: new Error("mediaDevices unavailable") };
  }

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await enumerate(kind);
  } catch (error) {
    return { devices: [], error };
  }
  if (!requestPermission || hasLabels(devices)) return { devices, error: null };

  let error: unknown = null;
  try {
    // Speakers share the microphone permission — there is no output prompt.
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "videoinput" ? { video: true } : { audio: true },
    );
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    error = e;
  }
  try {
    devices = await enumerate(kind);
  } catch (e) {
    error = error ?? e;
  }
  return { devices, error };
}

/**
 * `onDeviceError` for LiveKit track toggles. The failure is already reported to
 * the user by `MediaDeviceProvider` (it listens to `RoomEvent.MediaDevicesError`,
 * which LiveKit raises for every capture failure); passing a handler just keeps
 * the toggle from rethrowing it as an unhandled promise rejection.
 */
export function ignoreDeviceError() {}

type SinkableAudio = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

/**
 * Plays a short two-note chime on the chosen speaker so a student can confirm
 * they can hear the class. Routed through an `<audio>` element because that is
 * where `setSinkId` lives; without it, the system output is used.
 */
export async function playTestSound(sinkId?: string) {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Audio playback isn't supported in this browser.");

  const ctx = new Ctx();
  const gain = ctx.createGain();
  const destination = ctx.createMediaStreamDestination();
  gain.connect(destination);

  const audio = new Audio() as SinkableAudio;
  audio.srcObject = destination.stream;
  try {
    if (sinkId && sinkId !== "default" && audio.setSinkId) await audio.setSinkId(sinkId);
    await ctx.resume();
    await audio.play();

    const start = ctx.currentTime;
    [660, 880].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(start + i * 0.25);
      osc.stop(start + i * 0.25 + 0.22);
    });
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.03);
    gain.gain.setValueAtTime(0.3, start + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);

    await new Promise((resolve) => window.setTimeout(resolve, 650));
  } finally {
    audio.pause();
    audio.srcObject = null;
    void ctx.close();
  }
}
