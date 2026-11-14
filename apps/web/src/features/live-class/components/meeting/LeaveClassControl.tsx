"use client";

import { useState, type ReactNode } from "react";
import { useDisconnectButton } from "@livekit/components-react";
import { toast } from "sonner";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { endLiveClass } from "../../api/live-class";
import { useMemberClassId } from "../../providers/LiveRoomContext";

/**
 * Shared "leave the class" affordance. Students get a lightweight confirm so the
 * exit isn't a single mis-tap; coaches get the leave-quietly / end-for-everyone
 * choice. The trigger is a render prop so the same logic backs both the toolbar
 * icon button and the top-bar text button without nesting Radix `asChild` slots.
 */
export function LeaveClassControl({
  children,
}: {
  children: (open: () => void) => ReactNode;
}) {
  const roomId = useMemberClassId();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const leave = () => {
    setOpen(false);
    (leaveProps.onClick as ((e?: unknown) => void) | undefined)?.();
  };

  const handleEndClass = async () => {
    if (!roomId || ending) return;
    setEnding(true);
    try {
      await endLiveClass(roomId);
      toast.success("Class ended for everyone");
      // The disconnect webhook redirects the coach.
    } catch {
      toast.error("Failed to end class");
      setEnding(false);
    }
  };

  return (
    <>
      {children(() => setOpen(true))}

      {isCoach ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Leave class?</DialogTitle>
              <DialogDescription>
                Step out for a moment, or end the class for everyone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <Button
                variant="outline"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={leave}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-app-text">Leave quietly</span>
                  <span className="text-sm font-normal text-app-muted">
                    The room stays open for students.
                  </span>
                </span>
              </Button>
              <Button
                variant="destructive"
                className="h-auto justify-start px-4 py-3 text-left"
                disabled={ending}
                onClick={handleEndClass}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-white">End class for everyone</span>
                  <span className="text-sm font-normal text-white/80">
                    Finalizes attendance immediately.
                  </span>
                </span>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Leave class?</DialogTitle>
              <DialogDescription>
                Your attendance is saved. You can rejoin while the class is live.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Stay
              </Button>
              <Button variant="destructive" onClick={leave}>
                Leave class
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
