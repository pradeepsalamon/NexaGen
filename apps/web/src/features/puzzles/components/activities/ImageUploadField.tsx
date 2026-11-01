"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/providers/ToastProvider";
import { uploadActivityImage } from "../../api/activityApi";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** One optional image for a question or an answer: PNG, JPG or WebP, up to 5 MB. */
export function ImageUploadField({
  value,
  onChange,
  label
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      toast.error({ message: "Use a PNG, JPG or WebP image.", title: "That file type won't work" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error({ message: "Images can be up to 5 MB.", title: "That image is too large" });
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadActivityImage(file);
      onChange(url);
    } catch (error) {
      toast.error({ message: (error as Error).message, title: "Couldn't upload the image" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={TYPES.join(",")}
        aria-label={label}
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ImagePlus className="mr-1.5 size-4" strokeWidth={2.5} />}
        {value ? "Replace image" : "Add image"}
      </Button>
      {value ? (
        <span className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded CDN image of unknown size */}
          <img src={value} alt="" className="h-12 w-12 rounded-control border border-app-border object-cover" />
          <SimpleTooltip label="Remove image">
            <button
              type="button"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={() => onChange(null)}
              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-app-danger text-white"
            >
              <X className="size-3" strokeWidth={3} />
            </button>
          </SimpleTooltip>
        </span>
      ) : null}
    </div>
  );
}
