"use client";

import { useRef, useState, type ReactNode } from "react";
import { VideoTrack, useLocalParticipant } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Ban, Check, ImagePlus, Loader2, ScanFace, Sparkles, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_PRESETS,
  BLUR_LEVELS,
  loadCustomBackground,
  sameBackground,
  type VideoBackground,
} from "../../lib/videoEffects/prefs";
import { useVideoEffects } from "../../providers/VideoEffectsProvider";

function Tile({
  children,
  label,
  onClick,
  selected,
  style,
}: {
  children?: ReactNode;
  label: string;
  onClick: () => void;
  selected: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        style={style}
        className={cn(
          "relative flex aspect-video min-w-0 items-center justify-center overflow-hidden rounded-control border bg-app-soft bg-cover bg-center text-app-muted transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          selected ? "border-primary ring-2 ring-primary" : "border-app-border",
        )}
      >
        {children}
        {selected && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-white">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </button>
    </SimpleTooltip>
  );
}

function SelfPreview({ busy }: { busy: boolean }) {
  const { cameraTrack, isCameraEnabled, localParticipant } = useLocalParticipant();
  const [enabling, setEnabling] = useState(false);

  if (!isCameraEnabled || !cameraTrack) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-control border border-dashed border-app-border bg-app-soft/50 p-3 text-center text-xs text-app-muted">
        <VideoOff className="size-5" />
        <span>Turn on your camera to preview effects.</span>
        <Button
          size="sm"
          variant="outline"
          className="min-h-7 text-xs"
          isLoading={enabling}
          onClick={async () => {
            setEnabling(true);
            try {
              await localParticipant.setCameraEnabled(true);
            } catch {
              // MediaDeviceProvider reports capture failures (toast + Settings issue).
            } finally {
              setEnabling(false);
            }
          }}
        >
          Start video
        </Button>
      </div>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-control bg-black">
      <VideoTrack
        trackRef={{ participant: localParticipant, publication: cameraTrack, source: Track.Source.Camera }}
        className="h-full w-full -scale-x-100 object-cover"
      />
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-xs font-semibold text-white">
          <Loader2 className="size-4 animate-spin" />
          Loading effects…
        </div>
      )}
    </div>
  );
}

/** "Video effects" body of the meeting Settings panel. */
export function MeetingVideoEffects() {
  const effects = useVideoEffects();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!effects) return null;
  const { prefs, setAutoFraming, setBackground, setCustomImage, status, supported } = effects;

  if (supported === false) {
    return (
      <p className="rounded-control border border-dashed border-app-border bg-app-soft/50 px-3 py-2 text-xs text-app-muted">
        This browser can&apos;t run video effects. Use an up-to-date Chrome, Edge or Safari on a
        computer for virtual backgrounds and auto-framing.
      </p>
    );
  }

  const pick = (background: VideoBackground) => setBackground(background);
  const isSelected = (background: VideoBackground) => sameBackground(prefs.background, background);
  const customImage = typeof window === "undefined" ? null : loadCustomBackground();

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await setCustomImage(file);
      toast.success("Background updated", { duration: 2000 });
    } catch (error) {
      toast.error("Couldn't use that image", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <SelfPreview busy={status === "loading"} />

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
          <Sparkles className="size-3.5 text-app-muted" />
          Background
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <Tile label="No effect" onClick={() => pick({ type: "none" })} selected={isSelected({ type: "none" })}>
            <Ban className="size-5" />
          </Tile>
          {BLUR_LEVELS.map((level) => (
            <Tile
              key={level.radius}
              label={level.label}
              onClick={() => pick({ radius: level.radius, type: "blur" })}
              selected={isSelected({ radius: level.radius, type: "blur" })}
              style={{ backgroundImage: "url(/video-backgrounds/studio-thumb.jpg)" }}
            >
              <span
                className="absolute inset-0 bg-white/20"
                style={{ backdropFilter: `blur(${level.radius / 4}px)` }}
                aria-hidden="true"
              />
              <span className="relative rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {level.label}
              </span>
            </Tile>
          ))}
          {BACKGROUND_PRESETS.map((preset) => (
            <Tile
              key={preset.id}
              label={preset.label}
              onClick={() => pick({ id: preset.id, type: "image" })}
              selected={isSelected({ id: preset.id, type: "image" })}
              style={{ backgroundImage: `url(${preset.thumb})` }}
            />
          ))}
          {customImage && (
            <Tile
              label="Your image"
              onClick={() => pick({ type: "custom" })}
              selected={isSelected({ type: "custom" })}
              style={{ backgroundImage: `url(${customImage})` }}
            />
          )}
          <Tile label="Upload an image" onClick={() => fileInput.current?.click()} selected={false}>
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          </Tile>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onUpload(e.target.files?.[0])}
        />
      </div>

      <div className="flex items-start justify-between gap-3 border-t border-app-border pt-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
            <ScanFace className="size-3.5 text-app-muted" />
            Auto-framing
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-app-muted">
            Zooms in and follows your face so you stay centred, like Zoom and Center Stage.
          </p>
        </div>
        <Switch
          checked={prefs.autoFraming}
          onCheckedChange={setAutoFraming}
          aria-label="Auto-framing"
        />
      </div>

      {status === "error" && (
        <p role="alert" className="text-[11px] text-app-danger-ink">
          Effects couldn&apos;t start on this device. Your camera works normally without them.
        </p>
      )}
      <p className="text-[11px] leading-snug text-app-muted">
        Everyone in the class sees the effect. Saved on this device. Effects use extra battery on
        phones and older laptops.
      </p>
    </div>
  );
}
