import {
  BackgroundTransformer,
  ProcessorWrapper,
  supportsBackgroundProcessors,
  type BackgroundOptions,
} from "@livekit/track-processors";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { TrackTransformerDestroyOptions, VideoTransformerInitOptions } from "@livekit/track-processors";
import { AutoFramer, type Rect } from "./framing";
import { backgroundImageSrc, type VideoEffectsPrefs } from "./prefs";

/**
 * The camera processor behind "Video effects": LiveKit's background
 * segmentation (blur / replace, MediaPipe selfie segmenter on WebGL) followed
 * by an auto-framing crop driven by MediaPipe's BlazeFace detector.
 *
 * This module is ~1 MB with MediaPipe, so it is only ever reached through a
 * dynamic `import()` — a class where nobody turns an effect on never
 * downloads it. The WASM runtime and models load from the same CDN LiveKit's
 * processor uses by default; the version is pinned to the `@mediapipe/tasks-vision`
 * that `@livekit/track-processors` depends on (package.json pins it too).
 */

const MEDIAPIPE_VERSION = "0.10.14";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/** Face detection runs ~7× a second; the crop glides smoothly between results. */
const DETECT_INTERVAL_MS = 150;
/** Average per-frame cost above which the device is struggling (30 fps ⇒ 33 ms budget). */
const SLOW_FRAME_MS = 45;

type CameraEffectsOptions = BackgroundOptions & { autoFraming?: boolean };

export interface CameraEffectsCallbacks {
  /** Called once when processing is consistently too slow for this device. */
  onSlow?: () => void;
  /** Called if face detection could not be loaded (auto-framing then does nothing). */
  onFramingUnavailable?: (error: unknown) => void;
}

export function isVideoEffectsSupported() {
  try {
    return supportsBackgroundProcessors();
  } catch {
    return false;
  }
}

class CameraEffectsTransformer extends BackgroundTransformer {
  private autoFraming = false;
  private callbacks: CameraEffectsCallbacks = {};
  private cropCanvas?: OffscreenCanvas;
  private cropCtx?: OffscreenCanvasRenderingContext2D | null;
  private detector?: FaceDetector;
  private detectorLoad?: Promise<void>;
  private framer = new AutoFramer();
  private frameCostMs = 0;
  private framesMeasured = 0;
  private lastDetectAt = 0;
  private lastDetectTs = 0;
  private slowReported = false;

  setCallbacks(callbacks: CameraEffectsCallbacks) {
    this.callbacks = callbacks;
  }

  async init(opts: VideoTransformerInitOptions) {
    await super.init(opts);
    if (this.autoFraming) void this.ensureDetector();
  }

  async destroy(options?: TrackTransformerDestroyOptions) {
    await super.destroy(options);
    this.framer.reset();
    if (!options?.willProcessorRestart) {
      this.detector?.close();
      this.detector = undefined;
      this.detectorLoad = undefined;
    }
  }

  // Also runs from BackgroundTransformer's constructor, before this class's
  // fields exist — the constructor never passes `autoFraming`, so that call
  // only reaches `super.update`.
  async update(opts: CameraEffectsOptions) {
    const { autoFraming, ...background } = opts;
    if (autoFraming !== undefined) {
      this.autoFraming = autoFraming;
      if (autoFraming) {
        void this.ensureDetector();
      } else {
        this.framer.reset();
      }
    }
    await super.update(background);
  }

  async transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    const started = performance.now();
    try {
      if (!this.autoFraming || !(frame instanceof VideoFrame) || frame.codedWidth === 0) {
        await super.transform(frame, controller);
        return;
      }

      const width = frame.displayWidth;
      const height = frame.displayHeight;
      if (this.detector && started - this.lastDetectAt >= DETECT_INTERVAL_MS) {
        this.lastDetectAt = started;
        this.framer.observe(this.detectFaces(frame), width, height, started);
      }

      const crop = this.framer.crop(width, height, started);
      if (crop.width >= width - 1 && crop.height >= height - 1) {
        await super.transform(frame, controller);
        return;
      }

      await super.transform(frame, this.croppingController(controller, crop, width, height));
    } finally {
      this.measure(performance.now() - started);
    }
  }

  private croppingController(
    controller: TransformStreamDefaultController<VideoFrame>,
    crop: Rect,
    width: number,
    height: number,
  ): TransformStreamDefaultController<VideoFrame> {
    return {
      get desiredSize() {
        return controller.desiredSize;
      },
      enqueue: (out?: VideoFrame) => {
        if (!out) return;
        let cropped: VideoFrame | null = null;
        try {
          cropped = this.cropFrame(out, crop, width, height);
        } catch {
          cropped = null;
        }
        if (cropped) {
          out.close();
          controller.enqueue(cropped);
        } else {
          controller.enqueue(out);
        }
      },
      error: (reason?: unknown) => controller.error(reason),
      terminate: () => controller.terminate(),
    };
  }

  private cropFrame(out: VideoFrame, crop: Rect, width: number, height: number): VideoFrame | null {
    if (!this.cropCanvas || this.cropCanvas.width !== width || this.cropCanvas.height !== height) {
      this.cropCanvas = new OffscreenCanvas(width, height);
      this.cropCtx = this.cropCanvas.getContext("2d");
      if (this.cropCtx) this.cropCtx.imageSmoothingQuality = "high";
    }
    const ctx = this.cropCtx;
    if (!ctx) return null;
    // `out` is either the segmenter's output (canvas sized to the frame) or
    // the original frame — both in display-size coordinates.
    const sx = width / out.displayWidth;
    const sy = height / out.displayHeight;
    ctx.drawImage(out, crop.x / sx, crop.y / sy, crop.width / sx, crop.height / sy, 0, 0, width, height);
    return new VideoFrame(this.cropCanvas, { timestamp: out.timestamp });
  }

  private detectFaces(frame: VideoFrame): Rect[] {
    if (!this.detector) return [];
    // MediaPipe requires strictly increasing timestamps in VIDEO mode.
    const ts = Math.max(this.lastDetectTs + 1, Math.round(performance.now()));
    this.lastDetectTs = ts;
    try {
      const { detections } = this.detector.detectForVideo(frame, ts);
      const boxes = detections
        .filter((d) => (d.categories[0]?.score ?? 0) >= 0.5 && d.boundingBox)
        .map((d) => {
          const b = d.boundingBox!;
          return { height: b.height, width: b.width, x: b.originX, y: b.originY };
        });
      // Keep whoever is at the camera; a small face far behind them is ignored.
      const largest = Math.max(0, ...boxes.map((b) => b.height));
      return boxes.filter((b) => b.height >= largest * 0.4);
    } catch {
      return [];
    }
  }

  private ensureDetector() {
    if (this.detector) return Promise.resolve();
    this.detectorLoad ??= (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const create = (delegate: "GPU" | "CPU") =>
          FaceDetector.createFromOptions(fileset, {
            baseOptions: { delegate, modelAssetPath: FACE_MODEL_URL },
            minDetectionConfidence: 0.5,
            runningMode: "VIDEO",
          });
        this.detector = await create("GPU").catch(() => create("CPU"));
      } catch (error) {
        this.detectorLoad = undefined;
        this.callbacks.onFramingUnavailable?.(error);
      }
    })();
    return this.detectorLoad;
  }

  private measure(ms: number) {
    // Exponential moving average; judged only after a couple of seconds so
    // model warm-up doesn't count.
    this.frameCostMs = this.framesMeasured === 0 ? ms : this.frameCostMs * 0.95 + ms * 0.05;
    this.framesMeasured += 1;
    if (!this.slowReported && this.framesMeasured > 90 && this.frameCostMs > SLOW_FRAME_MS) {
      this.slowReported = true;
      this.callbacks.onSlow?.();
    }
  }
}

function toTransformerOptions(prefs: VideoEffectsPrefs): CameraEffectsOptions {
  const { background } = prefs;
  return {
    autoFraming: prefs.autoFraming,
    backgroundDisabled: background.type === "none",
    blurRadius: background.type === "blur" ? background.radius : undefined,
    imagePath: backgroundImageSrc(background),
  };
}

export class CameraEffectsProcessor extends ProcessorWrapper<CameraEffectsOptions, CameraEffectsTransformer> {
  /** Switch effects on the running processor, without a restart flash. */
  async apply(prefs: VideoEffectsPrefs) {
    await this.updateTransformerOptions(toTransformerOptions(prefs));
  }
}

export function createCameraEffectsProcessor(
  prefs: VideoEffectsPrefs,
  callbacks: CameraEffectsCallbacks = {},
) {
  const transformer = new CameraEffectsTransformer({
    assetPaths: { tasksVisionFileSet: WASM_URL },
  });
  transformer.setCallbacks(callbacks);
  // Set every option before init so the first frame is already processed.
  void transformer.update(toTransformerOptions(prefs));
  return new CameraEffectsProcessor(transformer, "nexa-camera-effects");
}
