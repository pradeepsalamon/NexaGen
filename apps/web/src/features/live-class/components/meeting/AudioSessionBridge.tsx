"use client";

import { useEffect } from "react";
import { useConnectionState, useRoomContext } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";

/**
 * Keeps class audio audible on a phone.
 *
 * Three separate things silence a mobile browser in a call, and the room needs
 * all three handled or it "sounds like a phone call with the app muted":
 *
 * 1. **Routing.** The moment a page captures the microphone, iOS Safari puts
 *    the page into a voice-call audio session and routes playback to the
 *    *earpiece* — quiet, held-to-the-ear audio — rather than the speaker.
 *    `navigator.audioSession.type` (WebKit's Audio Session API) is the only
 *    lever the platform gives us: `"play-and-record"` declares this as a
 *    two-way call that still plays out loud. It is set while connected and put
 *    back to `"auto"` on leave so the rest of the app is unaffected.
 *
 * 2. **Autoplay.** Remote tracks will not play until the page has user
 *    activation. LiveKit exposes that as `room.startAudio()`, and `<StartAudio>`
 *    renders a prompt for it — but a student who never notices the prompt hears
 *    nothing at all. Any tap anywhere in the room counts as activation, so the
 *    first one is used to start audio silently.
 *
 * 3. **Output element state.** An audio element that got left muted, at zero
 *    volume, or without `playsinline` (which iOS needs to keep media inline
 *    rather than handing it to the fullscreen player) stays silent no matter
 *    what the session says.
 *
 * Every call here is capability-detected: a browser without the Audio Session
 * API is left exactly as it was.
 */

type AudioSessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record";

interface AudioSessionCapableNavigator extends Navigator {
  audioSession?: { type: AudioSessionType };
}

function setAudioSessionType(type: AudioSessionType) {
  const nav = navigator as AudioSessionCapableNavigator;
  if (!nav.audioSession) return;
  try {
    nav.audioSession.type = type;
  } catch {
    // Older WebKit exposes the object but rejects some values — harmless.
  }
}

/** LiveKit renders remote audio into plain `<audio>` elements it appends itself. */
function unsilenceAudioElements() {
  document.querySelectorAll("audio").forEach((el) => {
    // Never touch an element something else deliberately muted (the mini
    // player's preview, say) — only the ones that carry a live remote track.
    if (!el.srcObject) return;
    el.muted = false;
    if (el.volume < 1) el.volume = 1;
    el.setAttribute("playsinline", "");
    if (el.paused) el.play().catch(() => {});
  });
}

export function AudioSessionBridge() {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;

  // 1. Declare the session as a two-way call so playback leaves the earpiece.
  useEffect(() => {
    if (!connected) return;
    setAudioSessionType("play-and-record");
    return () => setAudioSessionType("auto");
  }, [connected]);

  // 2. Turn the first tap anywhere in the room into audio playback permission.
  useEffect(() => {
    if (!room || !connected) return;

    const start = () => {
      if (room.canPlaybackAudio) return;
      room.startAudio().catch(() => {
        // Not yet a qualifying gesture — the next tap tries again, and
        // <StartAudio> is still on screen as the explicit fallback.
      });
    };

    // `pointerdown` fires before `click` and covers touch, pen and mouse.
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [room, connected]);

  // 3. Keep the output elements themselves audible — on connect, whenever a
  //    track arrives, and when returning from the background (iOS pauses media
  //    on a backgrounded tab and does not always resume it).
  useEffect(() => {
    if (!room || !connected) return;

    unsilenceAudioElements();

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      setAudioSessionType("play-and-record");
      unsilenceAudioElements();
    };

    // The elements are created asynchronously by <RoomAudioRenderer>, so watch
    // the DOM rather than guessing at a delay. Coalesced to one pass per frame:
    // a meeting mutates the DOM constantly and this fires on all of it.
    let queued = 0;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        unsilenceAudioElements();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      if (queued) cancelAnimationFrame(queued);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [room, connected]);

  return null;
}
