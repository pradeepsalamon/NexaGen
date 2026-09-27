import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Loader2 } from "lucide-react";
import { getRecordingDownloadUrl, updateRecordingProgress } from "@/features/live-class/api/live-class";
import { toast } from "sonner";

interface RecordingPlayerDialogProps {
  classId: string | null;
  isOpen: boolean;
  onClose: () => void;
  topic: string;
}

export function RecordingPlayerDialog({ classId, isOpen, onClose, topic }: RecordingPlayerDialogProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const highestTimeRef = useRef(0);
  const lastSyncTimeRef = useRef(0);

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
          onClose();
        }
      })
      .catch((error) => {
        console.error("Failed to get recording URL:", error);
        if (isMounted) {
          toast.error("Failed to load recording. It may have expired or is unavailable.");
          onClose();
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      // Sync remaining progress on unmount/close if we have valid watched time
      if (highestTimeRef.current > 0 && classId) {
        updateRecordingProgress(classId, Math.floor(highestTimeRef.current)).catch(console.error);
      }
    };
  }, [classId, isOpen, onClose]);

  const handleTimeUpdate = () => {
    if (!videoRef.current || !classId) return;

    const currentTime = videoRef.current.currentTime;
    
    // Track high water mark
    if (currentTime > highestTimeRef.current) {
      highestTimeRef.current = currentTime;
    }

    // Sync to backend every 10 seconds of *new* progress
    if (highestTimeRef.current - lastSyncTimeRef.current >= 10) {
      lastSyncTimeRef.current = highestTimeRef.current;
      updateRecordingProgress(classId, Math.floor(highestTimeRef.current)).catch(console.error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 overflow-hidden bg-black border-border/40">
        <DialogHeader className="p-4 bg-app-background/95 backdrop-blur z-10 border-b border-border/40 absolute top-0 w-full">
          <DialogTitle className="text-app-text">{topic} Recording</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex items-center justify-center bg-black pt-[60px] pb-4 px-4 w-full h-full relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/50 z-10">
              <Loader2 className="size-8 animate-spin text-app-accent mb-4" />
              <p>Loading recording...</p>
            </div>
          )}
          
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              controlsList="nodownload"
              autoPlay
              className="max-w-full max-h-full rounded-control shadow-soft"
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
