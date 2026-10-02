"use client";

import { useCallback, useEffect, useRef } from "react";
import { isTrackReference } from "@livekit/components-react";
import { useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { usePip } from "../../providers/PipProvider";
import { useSpotlightTrack } from "../../hooks/useSpotlightTrack";

const PLACEHOLDER_W = 640;
const PLACEHOLDER_H = 360;

/**
 * Draws the "no camera" card the PiP window shows when the spotlighted person
 * has their video off. The window has none of the app's CSS, so this is
 * painted by hand.
 */
function paintPlaceholder(canvas: HTMLCanvasElement, name: string, subtitle: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = PLACEHOLDER_W;
  canvas.height = PLACEHOLDER_H;

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, PLACEHOLDER_W, PLACEHOLDER_H);

  const initial = (name.trim()[0] || "?").toUpperCase();
  ctx.beginPath();
  ctx.arc(PLACEHOLDER_W / 2, PLACEHOLDER_H / 2 - 22, 46, 0, Math.PI * 2);
  ctx.fillStyle = "#1e293b";
  ctx.fill();

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 42px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initial, PLACEHOLDER_W / 2, PLACEHOLDER_H / 2 - 20);

  ctx.font = "600 22px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(name, PLACEHOLDER_W / 2, PLACEHOLDER_H / 2 + 54);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 16px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(subtitle, PLACEHOLDER_W / 2, PLACEHOLDER_H / 2 + 84);
}

/**
 * Feeds the browser's own Picture-in-Picture window on browsers without
 * Document PiP (Safari, iOS). It keeps one hidden `<video>` pointed at
 * whoever is spotlighted; the browser draws the floating frame itself, so
 * there are no in-window controls — only what it provides (play/pause and
 * back-to-tab).
 *
 * The element is offscreen rather than `display: none`: a video that is not
 * laid out will not reliably start decoding, and PiP needs a live frame.
 */
export function VideoPipSurface() {
  const { mode, registerPipVideo } = usePip();
  const { pinnedParticipantSid } = useLiveClassState("pinnedParticipantSid");
  const user = useAuthStore((state) => state.user);
  const spotlight = useSpotlightTrack(pinnedParticipantSid);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const placeholderStreamRef = useRef<MediaStream | null>(null);

  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      registerPipVideo(el);
    },
    [registerPipVideo],
  );

  const participant = spotlight?.participant;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant
    ? participant.name || (participant.isLocal ? localName : participant.identity)
    : "Live class";
  const liveTrack =
    spotlight && isTrackReference(spotlight) && !spotlight.publication.isMuted
      ? spotlight.publication.track?.mediaStreamTrack
      : undefined;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (mode !== "video" || !video || !canvas) return;

    if (liveTrack) {
      const stream = new MediaStream([liveTrack]);
      video.srcObject = stream;
    } else {
      // Repaint into the same canvas so its captured stream — and therefore
      // the open PiP window — survives the switch.
      paintPlaceholder(canvas, name, participant ? "Camera off" : "Waiting for the class…");
      if (!placeholderStreamRef.current) {
        placeholderStreamRef.current = canvas.captureStream();
      }
      if (video.srcObject !== placeholderStreamRef.current) {
        video.srcObject = placeholderStreamRef.current;
      }
    }

    void video.play().catch(() => {
      /* muted playback; autoplay policies should not reject */
    });
  }, [mode, liveTrack, name, participant]);

  if (mode !== "video") return null;

  return (
    <>
      <video
        ref={attachVideo}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none fixed left-0 top-0 size-px opacity-0"
      />
      <canvas ref={canvasRef} aria-hidden="true" className="hidden" />
    </>
  );
}
