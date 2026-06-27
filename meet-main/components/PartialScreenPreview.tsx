"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CropSelector } from "@/components/CropSelector";
import type { CropArea, CropShape } from "@/lib/partialScreenShare";

type PartialScreenPreviewProps = {
  hasSource: boolean;
  isPreviewReady: boolean;
  cropArea: CropArea | null;
  shape: CropShape;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCropChange: (area: CropArea) => void;
  onVideoReady: (size: { width: number; height: number }) => void;
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function fitRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): Rect {
  if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

function sourceToDisplay(area: CropArea, frameRect: Rect, sourceSize: Rect): CropArea {
  const scaleX = frameRect.width / sourceSize.width;
  const scaleY = frameRect.height / sourceSize.height;

  return {
    x: frameRect.left + area.x * scaleX,
    y: frameRect.top + area.y * scaleY,
    width: area.width * scaleX,
    height: area.height * scaleY,
    shape: area.shape,
  };
}

function displayToSource(area: CropArea, frameRect: Rect, sourceSize: Rect): CropArea {
  const scaleX = sourceSize.width / frameRect.width;
  const scaleY = sourceSize.height / frameRect.height;

  return {
    x: (area.x - frameRect.left) * scaleX,
    y: (area.y - frameRect.top) * scaleY,
    width: area.width * scaleX,
    height: area.height * scaleY,
    shape: area.shape,
  };
}

export function PartialScreenPreview({
  hasSource,
  isPreviewReady,
  cropArea,
  shape,
  videoRef,
  onCropChange,
  onVideoReady,
}: PartialScreenPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onVideoReadyRef = useRef(onVideoReady);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    onVideoReadyRef.current = onVideoReady;
  }, [onVideoReady]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(wrapper);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !isPreviewReady) {
      return;
    }

    const nextSize = {
      width: video.videoWidth,
      height: video.videoHeight,
    };

    if (
      nextSize.width &&
      nextSize.height &&
      (nextSize.width !== videoSize.width || nextSize.height !== videoSize.height)
    ) {
      setVideoSize(nextSize);
      onVideoReadyRef.current(nextSize);
    }
  }, [isPreviewReady, videoRef, videoSize.height, videoSize.width]);

  const frameRect = useMemo(
    () =>
      fitRect(
        containerSize.width,
        containerSize.height,
        videoSize.width,
        videoSize.height,
      ),
    [containerSize.height, containerSize.width, videoSize.height, videoSize.width],
  );

  const displayCrop = useMemo(() => {
    if (!cropArea || !videoSize.width || !videoSize.height || !frameRect.width) {
      return null;
    }

    return sourceToDisplay(
      cropArea,
      frameRect,
      {
        left: 0,
        top: 0,
        width: videoSize.width,
        height: videoSize.height,
      },
    );
  }, [cropArea, frameRect, videoSize.height, videoSize.width]);

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/70 bg-black"
      >
        <video
          ref={videoRef}
          className="absolute object-contain"
          autoPlay
          muted
          playsInline
          style={{
            left: frameRect.left,
            top: frameRect.top,
            width: frameRect.width,
            height: frameRect.height,
          }}
        />

        {displayCrop && frameRect.width > 0 ? (
          <CropSelector
            cropArea={displayCrop}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            shape={shape}
            onChange={(nextDisplayArea) => {
              if (!videoSize.width || !videoSize.height || !frameRect.width) {
                return;
              }

              onCropChange(
                displayToSource(nextDisplayArea, frameRect, {
                  left: 0,
                  top: 0,
                  width: videoSize.width,
                  height: videoSize.height,
                }),
              );
            }}
          />
        ) : hasSource ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            {isPreviewReady
              ? "Draw a crop area on top of the preview."
              : "Preparing selected screen preview..."}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Screen preview will appear here after selection.
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Drag to create a crop area, move it around, and resize it before you
        start sharing.
      </p>
    </div>
  );
}
