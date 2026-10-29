"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Loader2, Video } from "lucide-react";
import {
  getRecordingDownloadUrl,
  updateRecordingProgress
} from "@/features/live-class/api/live-class";
import { toast } from "sonner";

interface RecordingPlayerDialogProps {
  classId: string | null;
  isOpen: boolean;
  onClose: () => void;
  topic: string;
}

export function RecordingPlayerDialog({
  classId,
  isOpen,
  onClose,
  topic
}: RecordingPlayerDialogProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const highestTimeRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !classId) {
      setVideoUrl(null);
      highestTimeRef.current = 0;
      lastSyncTimeRef.current = 0;
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    getRecordingDownloadUrl(classId)
      .then((data) => {
        if (isMounted && data?.url) {
          setVideoUrl(data.url);
        } else if (isMounted) {
          toast.error("Failed to load recording URL.");
          onCloseRef.current();
        }
      })
      .catch((error) => {
        console.error("Failed to get recording URL:", error);
        if (isMounted) {
          toast.error(
            "Failed to load recording. It may have expired or is unavailable."
          );
          onCloseRef.current();
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      if (highestTimeRef.current > 0 && classId) {
        updateRecordingProgress(
          classId,
          Math.floor(highestTimeRef.current)
        ).catch(console.error);
      }
    };
  }, [classId, isOpen]);

  const handleTimeUpdate = () => {
    if (!videoRef.current || !classId) return;

    const currentTime = videoRef.current.currentTime;

    if (currentTime > highestTimeRef.current) {
      highestTimeRef.current = currentTime;
    }

    if (highestTimeRef.current - lastSyncTimeRef.current >= 10) {
      lastSyncTimeRef.current = highestTimeRef.current;
      updateRecordingProgress(
        classId,
        Math.floor(highestTimeRef.current)
      ).catch(console.error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85dvh] flex flex-col p-0 overflow-hidden rounded-2xl bg-nx-night border border-white/15 shadow-2xl">
        <DialogHeader className="px-5 py-3.5 bg-nx-night-card/95 backdrop-blur-md z-10 border-b border-white/10 absolute top-0 w-full">
          <DialogTitle className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-white">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-nx-midnight border border-nx-gold-400/30 text-nx-gold-400">
              <Video className="size-4" strokeWidth={2} />
            </span>
            <span className="truncate">{topic} Recording</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex items-center justify-center bg-black pt-[60px] pb-4 px-4 w-full h-full relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 z-10">
              <Loader2 className="size-8 animate-spin text-nx-gold-400 mb-3" />
              <p className="text-xs sm:text-sm font-medium text-nx-mist">
                Loading recording...
              </p>
            </div>
          )}

          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              controlsList="nodownload"
              autoPlay
              className="max-w-full max-h-full rounded-xl shadow-lg"
              onTimeUpdate={handleTimeUpdate}
            >
              Your browser does not support the video tag.
            </video>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}