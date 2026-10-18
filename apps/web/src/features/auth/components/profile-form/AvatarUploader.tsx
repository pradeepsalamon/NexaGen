"use client";

import { memo, useRef } from "react";
import { Edit2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface AvatarUploaderProps {
  avatarUrl: string;
  initials: string;
  isUploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export const AvatarUploader = memo(function AvatarUploader({
  avatarUrl,
  initials,
  isUploading,
  onUpload,
  onRemove
}: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4 mb-2">
      <div className="size-24 rounded-full overflow-hidden ring-2 ring-app-border bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))] text-primary-ink flex items-center justify-center shrink-0 shadow-card text-3xl font-extrabold">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {avatarUrl ? (
            <><Edit2 className="mr-2 h-4 w-4" /> Change Photo</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" /> Add Photo</>
          )}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-app-danger-ink hover:border-app-danger/30 hover:bg-app-danger/10 hover:text-app-danger-ink"
            onClick={onRemove}
            disabled={isUploading}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
});
