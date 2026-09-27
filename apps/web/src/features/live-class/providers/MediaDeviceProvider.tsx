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
import { useConnectionState, useRoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Track,
  TrackEvent,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import { toast } from "sonner";
import { resolveJoinState } from "@nexa-chess/types";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "./LiveClassProvider";
import {
  MEDIA_KINDS,
  MEDIA_KIND_LABEL,
  describeMediaError,
  deviceDisplayName,
  isAudioOutputSelectionSupported,
  isMediaCaptureAvailable,
  loadMediaPrefs,
  resolveSavedDevice,
  saveDevicePref,
  scanMediaDevices,
  type MediaErrorInfo,
  type MediaKind,
} from "../lib/mediaDevices";

/**
 * Keeps the local camera / microphone / speaker working for the whole class
 * and tells the user when they don't.
 *
 * - **Restores** the devices saved on this browser (`lib/mediaDevices.ts`) on
 *   connect, and switches back to one the moment it is plugged in again.
 * - **Honours the pre-join choice**: turns the mic / camera on at join when the
 *   class policy and the user's pre-join toggle both say so (the room itself
 *   connects with everything off).
 * - **Reports failures**: every capture error LiveKit raises
 *   (`RoomEvent.MediaDevicesError` — blocked permission, no device, device busy)
 *   becomes a toast and a persistent issue the Settings panel shows next to
 *   that device; a device that is unplugged mid-class, a track that dies, and a
 *   microphone that publishes pure silence are all announced.
 * - Selecting always uses a non-`exact` constraint, so a remembered device that
 *   has gone away degrades to the browser default instead of failing.
 */

export type MediaIssues = Partial<Record<MediaKind, MediaErrorInfo>>;

interface MediaDeviceContextValue {
  clearIssue: (kind: MediaKind) => void;
  /** True once the join-time device restore + auto-enable has run. */
  initialApplied: boolean;
  issues: MediaIssues;
  retry: (kind: MediaKind) => Promise<void>;
  selectDevice: (kind: MediaKind, device: MediaDeviceInfo) => Promise<boolean>;
}

const MediaDeviceContext = createContext<MediaDeviceContextValue | null>(null);

export function useMediaDeviceManager() {
  return useContext(MediaDeviceContext);
}

const KIND_TO_SOURCE = {
  audioinput: Track.Source.Microphone,
  videoinput: Track.Source.Camera,
} as const satisfies Record<"audioinput" | "videoinput", Track.Source>;

function sourceToKind(source: Track.Source): MediaKind | undefined {
  if (source === Track.Source.Microphone) return "audioinput";
  if (source === Track.Source.Camera) return "videoinput";
  return undefined;
}

function isMissingDeviceError(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return (
    name === "OverconstrainedError" || name === "NotFoundError" || name === "DevicesNotFoundError"
  );
}

export function MediaDeviceProvider({ children }: { children: ReactNode }) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;
  const { settings, setActiveSidebar } = useLiveClassState();
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);

  const [issues, setIssues] = useState<MediaIssues>({});
  const [initialApplied, setInitialApplied] = useState(false);
  const initialStarted = useRef(false);
  /** Last device list per kind — how an unplugged or newly plugged device is spotted. */
  const knownDevices = useRef<Partial<Record<MediaKind, MediaDeviceInfo[]>>>({});

  const openSettings = useCallback(() => setActiveSidebar("settings"), [setActiveSidebar]);

  const reportIssue = useCallback(
    (kind: MediaKind | undefined, error: unknown) => {
      const info = describeMediaError(error, kind);
      if (kind) setIssues((prev) => ({ ...prev, [kind]: info }));
      toast.error(info.title, {
        action: { label: "Settings", onClick: openSettings },
        description: info.description,
        duration: 8000,
        id: `media-error-${kind ?? "any"}`,
      });
    },
    [openSettings],
  );

  const clearIssue = useCallback((kind: MediaKind) => {
    setIssues((prev) => {
      if (!prev[kind]) return prev;
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    toast.dismiss(`media-error-${kind}`);
  }, []);

  /**
   * Points the room at the saved device for a kind if it is plugged in and not
   * already active. Returns the device it switched to.
   */
  const applySavedDevice = useCallback(
    async (kind: MediaKind, devices: MediaDeviceInfo[]) => {
      if (kind === "audiooutput" && !isAudioOutputSelectionSupported()) return undefined;
      const target = resolveSavedDevice(loadMediaPrefs()[kind], devices);
      if (!target || room.getActiveDevice(kind) === target.deviceId) return undefined;
      try {
        await room.switchActiveDevice(kind, target.deviceId, false);
        // The id may have rotated since it was saved — keep it current.
        saveDevicePref(kind, { deviceId: target.deviceId, label: target.label });
        return target;
      } catch {
        return undefined;
      }
    },
    [room],
  );

  const enableSource = useCallback(
    async (kind: "audioinput" | "videoinput") => {
      const lp = room.localParticipant;
      const enable = () =>
        kind === "audioinput" ? lp.setMicrophoneEnabled(true) : lp.setCameraEnabled(true);
      try {
        await enable();
        clearIssue(kind);
      } catch (error) {
        if (!isMissingDeviceError(error)) throw error;
        // The remembered device is gone: fall back to whatever the browser
        // offers first rather than leaving the student without a mic.
        const { devices } = await scanMediaDevices(kind, false);
        if (devices.length === 0) throw error;
        await room.switchActiveDevice(kind, devices[0].deviceId, false);
        await enable();
        clearIssue(kind);
      }
    },
    [clearIssue, room],
  );

  // ── Join: restore saved devices, then honour the pre-join mic / camera choice.
  useEffect(() => {
    if (!connected || initialStarted.current) return;
    initialStarted.current = true;

    void (async () => {
      if (!isMediaCaptureAvailable()) {
        reportIssue(undefined, null);
        setInitialApplied(true);
        return;
      }

      for (const kind of MEDIA_KINDS) {
        const { devices } = await scanMediaDevices(kind, false);
        knownDevices.current[kind] = devices;
        await applySavedDevice(kind, devices);
      }

      const prefs = loadMediaPrefs();
      const pref = { camera: prefs.cameraOn, mic: prefs.micOn };
      const joinState = settings
        ? resolveJoinState(settings, isStaff ? "COACH" : "STUDENT", pref)
        : { camera: { defaultOn: prefs.cameraOn === true }, mic: { defaultOn: prefs.micOn === true } };

      const wanted: Array<"audioinput" | "videoinput"> = [];
      if (joinState.mic.defaultOn && room.localParticipant.permissions?.canPublish !== false) {
        wanted.push("audioinput");
      }
      if (joinState.camera.defaultOn && room.localParticipant.permissions?.canPublish !== false) {
        wanted.push("videoinput");
      }
      for (const kind of wanted) {
        try {
          await enableSource(kind);
        } catch {
          // Already reported through RoomEvent.MediaDevicesError below.
        }
      }
      setInitialApplied(true);
    })();
  }, [applySavedDevice, connected, enableSource, isStaff, reportIssue, room, settings]);

  // ── Capture errors, dying tracks and silent microphones.
  useEffect(() => {
    const onDevicesError = (error: Error, kind?: MediaDeviceKind) => {
      reportIssue(kind as MediaKind | undefined, error);
    };

    const trackCleanups = new Map<LocalTrack, () => void>();

    const watchTrack = (pub: LocalTrackPublication) => {
      const track = pub.track;
      const kind = sourceToKind(pub.source);
      if (!track || !kind || trackCleanups.has(track)) return;
      clearIssue(kind);
      const onEnded = () => {
        // LiveKit restarts the track on the default device by itself; only
        // report when that did not bring it back.
        toast.warning(`${MEDIA_KIND_LABEL[kind]} disconnected`, {
          description: "Trying another device…",
          id: `media-ended-${kind}`,
        });
        window.setTimeout(() => {
          if (track.mediaStreamTrack?.readyState === "ended") {
            toast.dismiss(`media-ended-${kind}`);
            reportIssue(kind, Object.assign(new Error(""), { name: "NotFoundError" }));
          } else {
            toast.success(`${MEDIA_KIND_LABEL[kind]} is working again`, {
              duration: 2500,
              id: `media-ended-${kind}`,
            });
          }
        }, 2000);
      };
      track.on(TrackEvent.Ended, onEnded);
      trackCleanups.set(track, () => track.off(TrackEvent.Ended, onEnded));
    };

    const onPublished = (pub: LocalTrackPublication) => {
      watchTrack(pub);
      // Browsers hide speaker ids until mic / camera access is granted, which
      // a publish proves — so this is the first point a saved speaker can be
      // matched and restored.
      if (sourceToKind(pub.source)) {
        void scanMediaDevices("audiooutput", false).then(({ devices }) =>
          applySavedDevice("audiooutput", devices),
        );
      }
    };
    const onUnpublished = (pub: LocalTrackPublication) => {
      if (!pub.track) return;
      trackCleanups.get(pub.track)?.();
      trackCleanups.delete(pub.track);
    };

    const onSilence = (pub: LocalTrackPublication) => {
      // The muted capture PipMicCaptureBridge holds is silent by design.
      if (pub.isMuted || pub.source !== Track.Source.Microphone) return;
      toast.warning("We can't hear your microphone", {
        action: { label: "Settings", onClick: openSettings },
        description:
          "It's sending silence. Check it isn't muted on the device itself, or pick another microphone.",
        duration: 8000,
        id: "media-silent-mic",
      });
    };

    room.localParticipant.trackPublications.forEach((pub) => watchTrack(pub));
    room
      .on(RoomEvent.MediaDevicesError, onDevicesError)
      .on(RoomEvent.LocalTrackPublished, onPublished)
      .on(RoomEvent.LocalTrackUnpublished, onUnpublished)
      .on(RoomEvent.LocalAudioSilenceDetected, onSilence);
    return () => {
      room
        .off(RoomEvent.MediaDevicesError, onDevicesError)
        .off(RoomEvent.LocalTrackPublished, onPublished)
        .off(RoomEvent.LocalTrackUnpublished, onUnpublished)
        .off(RoomEvent.LocalAudioSilenceDetected, onSilence);
      trackCleanups.forEach((cleanup) => cleanup());
    };
  }, [applySavedDevice, clearIssue, openSettings, reportIssue, room]);

  // ── Hot-plug: announce removed / added devices and restore the saved one.
  useEffect(() => {
    if (!connected) return;

    const onDevicesChanged = async () => {
      for (const kind of MEDIA_KINDS) {
        const { devices } = await scanMediaDevices(kind, false);
        const previous = knownDevices.current[kind];
        knownDevices.current[kind] = devices;
        if (!previous) continue;

        const noun = MEDIA_KIND_LABEL[kind];
        const removed = previous.filter(
          (d) => d.label && !devices.some((n) => n.deviceId === d.deviceId),
        );
        const added = devices.filter(
          (d) => d.label && !previous.some((p) => p.deviceId === d.deviceId),
        );

        const restored = await applySavedDevice(kind, devices);
        if (restored) {
          toast.success(`${noun} switched back to ${deviceDisplayName(restored, kind)}`, {
            duration: 3000,
            id: `media-change-${kind}`,
          });
          continue;
        }

        // Only the device actually in use is worth an interruption.
        const active = room.getActiveDevice(kind);
        const lostActive = removed.find((d) => d.deviceId === active);
        if (lostActive || (removed.length > 0 && devices.length === 0)) {
          const lost = lostActive ?? removed[0];
          toast.warning(`${noun} "${deviceDisplayName(lost, kind)}" disconnected`, {
            action: { label: "Settings", onClick: openSettings },
            description:
              devices.length > 0
                ? `Using ${deviceDisplayName(devices[0], kind)} instead.`
                : `No ${noun.toLowerCase()} is connected any more.`,
            duration: 6000,
            id: `media-change-${kind}`,
          });
          continue;
        }

        const fresh = added.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
        if (fresh.length > 0 && (kind !== "audiooutput" || isAudioOutputSelectionSupported())) {
          const device = fresh[0];
          toast.info(`New ${noun.toLowerCase()} detected`, {
            action: {
              label: "Use it",
              onClick: () => {
                void room
                  .switchActiveDevice(kind, device.deviceId, false)
                  .then(() => saveDevicePref(kind, { deviceId: device.deviceId, label: device.label }))
                  .catch((error) => reportIssue(kind, error));
              },
            },
            description: deviceDisplayName(device, kind),
            duration: 6000,
            id: `media-change-${kind}`,
          });
        }
      }
    };

    const handler = () => void onDevicesChanged();
    room.on(RoomEvent.MediaDevicesChanged, handler);
    return () => {
      room.off(RoomEvent.MediaDevicesChanged, handler);
    };
  }, [applySavedDevice, connected, openSettings, reportIssue, room]);

  const selectDevice = useCallback(
    async (kind: MediaKind, device: MediaDeviceInfo) => {
      try {
        await room.switchActiveDevice(kind, device.deviceId, false);
        saveDevicePref(kind, { deviceId: device.deviceId, label: device.label });
        clearIssue(kind);
        return true;
      } catch (error) {
        reportIssue(kind, error);
        return false;
      }
    },
    [clearIssue, reportIssue, room],
  );

  /**
   * Re-tests a device after the user fixed something (granted access, closed
   * the app hogging the camera). A live track is restarted in place, keeping
   * its mute state; with no track, it only re-checks access — it never turns a
   * microphone or camera on behind the user's back.
   */
  const retry = useCallback(
    async (kind: MediaKind) => {
      if (kind === "audiooutput") {
        clearIssue(kind);
        return;
      }
      const pub = room.localParticipant.getTrackPublication(KIND_TO_SOURCE[kind]);
      const track = kind === "audioinput" ? pub?.audioTrack : pub?.videoTrack;
      try {
        if (track) {
          await track.restartTrack();
          clearIssue(kind);
          toast.success(`${MEDIA_KIND_LABEL[kind]} is working`, { duration: 2500 });
          return;
        }
        const { devices, error } = await scanMediaDevices(kind, true);
        if (error) throw error;
        if (devices.length === 0) {
          throw Object.assign(new Error(""), { name: "NotFoundError" });
        }
        clearIssue(kind);
        toast.success(`${MEDIA_KIND_LABEL[kind]} is ready`, {
          description: "Turn it on from the toolbar when you need it.",
          duration: 3000,
        });
      } catch (error) {
        reportIssue(kind, error);
      }
    },
    [clearIssue, reportIssue, room],
  );

  const value = useMemo(
    () => ({ clearIssue, initialApplied, issues, retry, selectDevice }),
    [clearIssue, initialApplied, issues, retry, selectDevice],
  );

  return <MediaDeviceContext.Provider value={value}>{children}</MediaDeviceContext.Provider>;
}
