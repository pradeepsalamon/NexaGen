import { useEffect } from "react";
import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useLiveClassState } from "../providers/LiveClassProvider";
import { ignoreDeviceError } from "../lib/mediaDevices";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

/**
 * Registers global keyboard shortcuts for the meeting room.
 *
 * Shortcuts:
 *  M — Toggle microphone
 *  V — Toggle camera
 *  Escape — Close sidebar or exit fullscreen
 */
export function useKeyboardShortcuts() {
  // Capture failures are reported by MediaDeviceProvider (see ignoreDeviceError).
  const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError: ignoreDeviceError });
  const camera = useTrackToggle({ source: Track.Source.Camera, onDeviceError: ignoreDeviceError });
  const { activeSidebar, setActiveSidebar, isFullscreen, toggleFullscreen, settings } =
    useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const micLocked = !isCoach && settings?.student.mic === "FORCED_OFF";
  const cameraLocked = !isCoach && settings?.student.camera === "FORCED_OFF";

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case "m": {
          e.preventDefault();
          if (micLocked) break;
          const clickEvent = new MouseEvent("click", { bubbles: true });
          // Trigger the toggle through the button's onClick
          if (mic.buttonProps.onClick) {
            (mic.buttonProps.onClick as (e: unknown) => void)(clickEvent);
          }
          break;
        }
        case "v": {
          e.preventDefault();
          if (cameraLocked) break;
          const clickEvent = new MouseEvent("click", { bubbles: true });
          if (camera.buttonProps.onClick) {
            (camera.buttonProps.onClick as (e: unknown) => void)(clickEvent);
          }
          break;
        }
        case "escape": {
          if (isFullscreen) {
            toggleFullscreen();
          } else if (activeSidebar) {
            setActiveSidebar(null);
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mic.buttonProps, camera.buttonProps, micLocked, cameraLocked, activeSidebar, setActiveSidebar, isFullscreen, toggleFullscreen]);
}
