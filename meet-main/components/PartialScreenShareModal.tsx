"use client";

import { useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  LocalVideoTrack,
  Room,
  Track,
} from "livekit-client";
import {
  MonitorUp,
  RectangleHorizontal,
  Square,
  X,
} from "lucide-react";

import { PartialScreenPreview } from "@/components/PartialScreenPreview";
import { Button } from "@/components/ui/button";
import {
  createPartialScreenTrack,
  isVideoReady,
  type CropArea,
  type CropShape,
} from "@/lib/partialScreenShare";

export type ActivePartialScreenShare = {
  stop: () => Promise<void>;
};

type PartialScreenShareModalProps = {
  open: boolean;
  room: Room;
  onClose: () => void;
  onStarted: (session: ActivePartialScreenShare) => void;
  onStopped: () => void;
};

function createDefaultCropArea(
  width: number,
  height: number,
  shape: CropShape,
): CropArea {
  const baseWidth = width * 0.5;
  const baseHeight = height * 0.45;
  const size = Math.min(width, height) * 0.4;

  const cropWidth = shape === "rectangle" ? baseWidth : size;
  const cropHeight = shape === "rectangle" ? baseHeight : size;

  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
    shape,
  };
}

function normalizeShape(area: CropArea, shape: CropShape): CropArea {
  if (shape === "rectangle") {
    return { ...area, shape };
  }

  const size = Math.max(24, Math.max(area.width, area.height));
  return {
    x: area.x,
    y: area.y,
    width: size,
    height: size,
    shape,
  };
}

export function PartialScreenShareModal({
  open,
  room,
  onClose,
  onStarted,
  onStopped,
}: PartialScreenShareModalProps) {
  const isMountedRef = useRef(true);
  const sourceStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);
  const [shape, setShape] = useState<CropShape>("rectangle");
  const [hasSource, setHasSource] = useState(false);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      if (!cleanupRef.current) {
        sourceStreamRef.current?.getTracks().forEach((track) => track.stop());
        sourceStreamRef.current = null;
      }
    };
  }, []);

  if (!open) {
    return null;
  }

  function resetPreviewState() {
    if (!isMountedRef.current) {
      return;
    }

    setHasSource(false);
    setIsPreviewReady(false);
    setCropArea(null);
  }

  function stopPreviewSelection() {
    sourceStreamRef.current?.getTracks().forEach((track) => track.stop());
    sourceStreamRef.current = null;
    const video = previewVideoRef.current;

    if (video) {
      video.pause();
      video.srcObject = null;
    }

    resetPreviewState();
  }

  async function handleSelectScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("This browser does not support screen capture.");
      return;
    }

    setIsSelecting(true);
    setError(null);

    try {
      stopPreviewSelection();

      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          displaySurface: "window",
        },
        audio: false,
      });

      const screenTrack = nextStream.getVideoTracks()[0];

      if (!screenTrack) {
        throw new Error("No screen video track was returned.");
      }

      sourceStreamRef.current = nextStream;
      setHasSource(true);

      const video = previewVideoRef.current;

      if (!video) {
        throw new Error("Preview video element is not available.");
      }

      if (video.srcObject !== nextStream) {
        video.srcObject = nextStream;
      }

      video.muted = true;
      video.playsInline = true;

      if (!isVideoReady(video)) {
        await new Promise<void>((resolve, reject) => {
          const handleLoadedMetadata = () => {
            cleanupListeners();
            resolve();
          };
          const handleError = () => {
            cleanupListeners();
            reject(new Error("Screen preview could not be loaded."));
          };
          const cleanupListeners = () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            video.removeEventListener("error", handleError);
          };

          video.addEventListener("loadedmetadata", handleLoadedMetadata, {
            once: true,
          });
          video.addEventListener("error", handleError, { once: true });
        });
      }

      await video.play();
      setIsPreviewReady(true);

      screenTrack.onended = () => {
        const cleanup = cleanupRef.current;

        if (cleanup) {
          void cleanup();
          return;
        }

        stopPreviewSelection();
        if (isMountedRef.current) {
          setError("Screen source ended.");
        }
      };
    } catch (selectionError) {
      stopPreviewSelection();
      if (isMountedRef.current) {
        setError(
          selectionError instanceof Error
            ? selectionError.message
            : "Screen selection was cancelled.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsSelecting(false);
      }
    }
  }

  async function handleStartPartialShare() {
    if (room.state !== ConnectionState.Connected) {
      setError("LiveKit room is not connected.");
      return;
    }

    const sourceStream = sourceStreamRef.current;
    const video = previewVideoRef.current;

    if (!sourceStream || !cropArea || !video || !isVideoReady(video)) {
      setError("Select a screen and crop area first.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      const partialShare = await createPartialScreenTrack({
        sourceStream,
        videoElement: video,
        cropArea,
        fps: 30,
      });

      const localTrack = new LocalVideoTrack(partialShare.track, undefined, true);
      await room.localParticipant.publishTrack(localTrack, {
        name: "partial-screen-share",
        source: Track.Source.ScreenShare,
      });

      let stopped = false;

      const stop = async () => {
        if (stopped) {
          return;
        }

        stopped = true;

        try {
          await room.localParticipant.unpublishTrack(localTrack, false);
        } catch {}

        localTrack.stop();
        partialShare.stop();
        sourceStream.getTracks().forEach((track) => track.stop());
        sourceStreamRef.current = null;
        cleanupRef.current = null;
        onStopped();
      };

      cleanupRef.current = stop;
      partialShare.track.addEventListener(
        "ended",
        () => {
          void stop();
        },
        { once: true },
      );

      onStarted({ stop });
      onClose();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Failed to publish partial screen share.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-2xl shadow-black/30 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Partial screen share</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Select a screen area to publish
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Chromium-based browsers work best here. The browser captures the
              full selected screen first, then this app crops the chosen area
              through a canvas before publishing it to LiveKit.
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-500">
              Do not select this same browser tab or window. Choose another app
              window, monitor, or browser tab to avoid recursive preview
              flicker.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4 rounded-2xl border border-border/70 bg-background/65 p-4">
            <Button
              className="w-full justify-center"
              onClick={handleSelectScreen}
              disabled={isSelecting}
            >
              <MonitorUp className="size-4" />
              {isSelecting ? "Selecting..." : "Select Screen"}
            </Button>

            <div>
              <p className="text-sm font-medium">Shape</p>
              <div className="mt-3 grid gap-2">
                {(
                  [
                    ["rectangle", "Rectangle", RectangleHorizontal],
                    ["square", "Square", Square],
                    ["circle", "Circle", CircleIcon],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <Button
                    key={value}
                    variant={shape === value ? "default" : "secondary"}
                    className="justify-start"
                    onClick={() => {
                      setShape(value);
                      if (cropArea) {
                        setCropArea(normalizeShape(cropArea, value));
                      }
                    }}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleStartPartialShare}
                disabled={!hasSource || !isPreviewReady || !cropArea || isPublishing}
              >
                {isPublishing ? "Starting..." : "Start Partial Share"}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={stopPreviewSelection}
                disabled={!hasSource}
              >
                Stop
              </Button>
              <Button variant="ghost" className="w-full" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </aside>

          <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
            <PartialScreenPreview
              hasSource={hasSource}
              isPreviewReady={isPreviewReady}
              cropArea={cropArea}
              shape={shape}
              videoRef={previewVideoRef}
              onCropChange={(nextArea) => setCropArea({ ...nextArea, shape })}
              onVideoReady={({ width, height }) => {
                setCropArea((current) =>
                  current ? normalizeShape(current, shape) : createDefaultCropArea(width, height, shape),
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
