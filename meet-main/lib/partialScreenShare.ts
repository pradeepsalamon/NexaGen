/**
 * Best supported in Chromium-based browsers.
 * Browsers cannot capture an arbitrary desktop rectangle directly, so this
 * feature captures the full selected screen/window first and then crops it
 * through a canvas stream before publishing to LiveKit.
 */

export type CropShape = "rectangle" | "square" | "circle";

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: CropShape;
};

type CreatePartialScreenTrackOptions = {
  sourceStream: MediaStream;
  videoElement: HTMLVideoElement;
  cropArea: CropArea;
  fps?: number;
};

type PartialTrackSession = {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
};

type FramePipelineGenerator = {
  track: MediaStreamTrack;
  writable: WritableStream<VideoFrame>;
  stop: () => void;
};

export function isVideoReady(video: HTMLVideoElement | null) {
  return Boolean(
    video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0,
  );
}

function normalizeDimension(value: number, fallback: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : fallback));
}

function getFramePipelineGenerator(): FramePipelineGenerator | null {
  type GeneratorWithTrack = {
    track?: MediaStreamTrack;
    writable?: WritableStream<VideoFrame>;
    stop?: () => void;
  };

  const frameApi = globalThis as typeof globalThis & {
    MediaStreamTrackGenerator?: new (init: { kind: "video" }) => GeneratorWithTrack;
    VideoTrackGenerator?: new () => GeneratorWithTrack;
  };

  if (frameApi.MediaStreamTrackGenerator) {
    const generator = new frameApi.MediaStreamTrackGenerator({
      kind: "video",
    });
    const track =
      generator instanceof MediaStreamTrack ? generator : generator.track;

    if (track && generator.writable) {
      return {
        track,
        writable: generator.writable,
        stop: () => {
          generator.stop?.();
          track.stop();
        },
      };
    }
  }

  if (frameApi.VideoTrackGenerator) {
    const generator = new frameApi.VideoTrackGenerator();
    const track =
      generator instanceof MediaStreamTrack ? generator : generator.track;

    if (track && generator.writable) {
      return {
        track,
        writable: generator.writable,
        stop: () => {
          generator.stop?.();
          track.stop();
        },
      };
    }
  }

  return null;
}

async function createFrameProcessedTrack({
  sourceVideoTrack,
  videoElement,
  cropArea,
}: {
  sourceVideoTrack: MediaStreamTrack;
  videoElement: HTMLVideoElement;
  cropArea: CropArea;
}): Promise<PartialTrackSession | null> {
  type TrackProcessorConstructor = new (init: {
    track: MediaStreamTrack;
  }) => {
    readable: ReadableStream<VideoFrame>;
  };

  const frameApi = globalThis as typeof globalThis & {
    MediaStreamTrackProcessor?: TrackProcessorConstructor;
  };

  if (
    !frameApi.MediaStreamTrackProcessor ||
    typeof OffscreenCanvas === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return null;
  }

  const generator = getFramePipelineGenerator();

  if (!generator) {
    return null;
  }

  const processor = new frameApi.MediaStreamTrackProcessor({
    track: sourceVideoTrack,
  });
  const reader = processor.readable.getReader();
  const writer = generator.writable.getWriter();
  const latestCropArea = { ...cropArea };
  const drawWidth = normalizeDimension(
    latestCropArea.width,
    videoElement.videoWidth || 1280,
  );
  const drawHeight =
    latestCropArea.shape === "circle"
      ? drawWidth
      : normalizeDimension(
          latestCropArea.height,
          videoElement.videoHeight || 720,
        );
  const canvas = new OffscreenCanvas(drawWidth, drawHeight);
  const context = canvas.getContext("2d");

  if (!context) {
    generator.stop();
    await reader.cancel().catch(() => undefined);
    await writer.abort().catch(() => undefined);
    return null;
  }

  let isStopped = false;

  const stop = () => {
    if (isStopped) {
      return;
    }

    isStopped = true;
    void reader.cancel().catch(() => undefined);
    void writer.close().catch(() => undefined);
    generator.stop();
  };

  const pumpFrames = async () => {
    try {
      while (!isStopped) {
        const { done, value } = await reader.read();

        if (done || !value) {
          break;
        }

        try {
          const sx = Math.max(0, Math.round(latestCropArea.x));
          const sy = Math.max(0, Math.round(latestCropArea.y));
          const sw = normalizeDimension(
            latestCropArea.width,
            value.displayWidth || value.codedWidth || videoElement.videoWidth,
          );
          const sh =
            latestCropArea.shape === "circle"
              ? sw
              : normalizeDimension(
                  latestCropArea.height,
                  value.displayHeight ||
                    value.codedHeight ||
                    videoElement.videoHeight,
                );

          context.clearRect(0, 0, canvas.width, canvas.height);

          if (latestCropArea.shape === "circle") {
            context.save();
            context.beginPath();
            context.arc(
              canvas.width / 2,
              canvas.height / 2,
              Math.min(canvas.width, canvas.height) / 2,
              0,
              Math.PI * 2,
            );
            context.closePath();
            context.clip();
          }

          context.drawImage(
            value,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          if (latestCropArea.shape === "circle") {
            context.restore();
          }

          const outputFrame = new VideoFrame(canvas, {
            timestamp: value.timestamp,
            alpha: latestCropArea.shape === "circle" ? "keep" : "discard",
          });

          try {
            await writer.write(outputFrame);
          } finally {
            outputFrame.close();
          }
        } finally {
          value.close();
        }
      }
    } catch {
      // Fall through to cleanup; the caller can retry with the canvas fallback.
    } finally {
      stop();
    }
  };

  void pumpFrames();

  sourceVideoTrack.addEventListener("ended", stop, { once: true });

  return {
    stream: new MediaStream([generator.track]),
    track: generator.track,
    stop,
  };
}

async function createCanvasCapturedTrack({
  sourceStream,
  videoElement,
  cropArea,
  fps,
}: CreatePartialScreenTrackOptions): Promise<PartialTrackSession> {
  const sourceVideoTrack = sourceStream.getVideoTracks()[0];

  if (!sourceVideoTrack) {
    throw new Error("No screen video track was found.");
  }

  if (!isVideoReady(videoElement)) {
    throw new Error("Screen preview is not ready yet.");
  }

  // Keep a dedicated off-DOM video alive for the crop loop so the stream
  // continues updating even after the modal preview unmounts.
  const renderVideo = document.createElement("video");
  renderVideo.muted = true;
  renderVideo.playsInline = true;
  renderVideo.srcObject = sourceStream;

  if (!isVideoReady(renderVideo)) {
    await new Promise<void>((resolve, reject) => {
      const handleLoadedMetadata = () => {
        cleanupListeners();
        resolve();
      };
      const handleError = () => {
        cleanupListeners();
        reject(new Error("Partial share render video could not start."));
      };
      const cleanupListeners = () => {
        renderVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
        renderVideo.removeEventListener("error", handleError);
      };

      renderVideo.addEventListener("loadedmetadata", handleLoadedMetadata, {
        once: true,
      });
      renderVideo.addEventListener("error", handleError, { once: true });
    });
  }

  await renderVideo.play();

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available in this browser.");
  }

  const latestCropArea = { ...cropArea };
  const drawWidth = normalizeDimension(
    latestCropArea.width,
    renderVideo.videoWidth || videoElement.videoWidth,
  );
  const drawHeight =
    latestCropArea.shape === "circle"
      ? drawWidth
      : normalizeDimension(
          latestCropArea.height,
          renderVideo.videoHeight || videoElement.videoHeight,
        );

  canvas.width = drawWidth;
  canvas.height = drawHeight;

  let isStopped = false;
  let animationFrameId = 0;
  let videoFrameRequestId = 0;

  const scheduleNextFrame = () => {
    if (isStopped) {
      return;
    }

    if ("requestVideoFrameCallback" in renderVideo) {
      videoFrameRequestId = renderVideo.requestVideoFrameCallback(() => {
        drawFrame();
      });
      return;
    }

    animationFrameId = window.requestAnimationFrame(drawFrame);
  };

  const cancelScheduledFrame = () => {
    if (videoFrameRequestId) {
      renderVideo.cancelVideoFrameCallback(videoFrameRequestId);
      videoFrameRequestId = 0;
    }

    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  };

  const drawFrame = () => {
    if (isStopped) {
      return;
    }

    if (!isVideoReady(renderVideo)) {
      scheduleNextFrame();
      return;
    }

    const sx = Math.max(0, Math.round(latestCropArea.x));
    const sy = Math.max(0, Math.round(latestCropArea.y));
    const sw = normalizeDimension(
      latestCropArea.width,
      renderVideo.videoWidth || videoElement.videoWidth,
    );
    const sh =
      latestCropArea.shape === "circle"
        ? sw
        : normalizeDimension(
            latestCropArea.height,
            renderVideo.videoHeight || videoElement.videoHeight,
          );

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (latestCropArea.shape === "circle") {
      context.save();
      context.beginPath();
      context.arc(
        canvas.width / 2,
        canvas.height / 2,
        Math.min(canvas.width, canvas.height) / 2,
        0,
        Math.PI * 2,
      );
      context.closePath();
      context.clip();
    }

    context.drawImage(
      renderVideo,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    if (latestCropArea.shape === "circle") {
      context.restore();
    }

    scheduleNextFrame();
  };

  drawFrame();

  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0];

  if (!track) {
    cancelScheduledFrame();
    throw new Error("Unable to create a cropped canvas video track.");
  }

  const stop = () => {
    if (isStopped) {
      return;
    }

    isStopped = true;
    cancelScheduledFrame();
    renderVideo.pause();
    renderVideo.srcObject = null;
    stream.getTracks().forEach((streamTrack) => streamTrack.stop());
  };

  sourceVideoTrack.addEventListener("ended", stop, { once: true });

  return {
    stream,
    track,
    stop,
  };
}

export async function createPartialScreenTrack({
  sourceStream,
  videoElement,
  cropArea,
  fps = 30,
}: CreatePartialScreenTrackOptions): Promise<PartialTrackSession> {
  const sourceVideoTrack = sourceStream.getVideoTracks()[0];

  if (!sourceVideoTrack) {
    throw new Error("No screen video track was found.");
  }

  if (!isVideoReady(videoElement)) {
    throw new Error("Screen preview is not ready yet.");
  }

  const frameProcessedTrack = await createFrameProcessedTrack({
    sourceVideoTrack,
    videoElement,
    cropArea,
  });

  if (frameProcessedTrack) {
    return frameProcessedTrack;
  }

  return createCanvasCapturedTrack({
    sourceStream,
    videoElement,
    cropArea,
    fps,
  });
}
