"use client";

import { useState, type ComponentProps } from "react";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useEndLiveClass } from "../hooks/useLiveClassApi";

/** Ends a live class from outside the room (class page, connection-lost screen). */
export function EndClassButton({
  classId,
  onEnded,
  size = "default",
  className,
}: {
  classId: string;
  onEnded?: () => void;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const endClass = useEndLiveClass(classId);

  const confirm = () => {
    endClass.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        onEnded?.();
      },
    });
  };

  return (
    <>
      <Button variant="destructive" size={size} className={className} onClick={() => setOpen(true)}>
        <Square className="mr-2 size-4" strokeWidth={2.5} />
        End class
      </Button>
      <Dialog open={open} onOpenChange={(next) => !endClass.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End class for everyone?</DialogTitle>
            <DialogDescription>
              Everyone still in the room is disconnected and attendance is finalized. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={endClass.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={endClass.isPending} onClick={confirm}>
              {endClass.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              End class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
