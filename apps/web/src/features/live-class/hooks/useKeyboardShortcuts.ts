import { useEffect } from "react";
import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useLiveClassState } from "../providers/LiveClassProvider";

/**
 * Registers global keyboard shortcuts for the meeting room.
 *
 * Shortcuts:
 *  M — Toggle microphone
 *  V — Toggle camera
 *  Escape — Close sidebar or exit fullscreen
 */
export function useKeyboardShortcuts() {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const { activeSidebar, setActiveSidebar, isFullscreen, toggleFullscreen } = useLiveClassState();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case "m": {
          e.preventDefault();
          const clickEvent = new MouseEvent("click", { bubbles: true });
          // Trigger the toggle through the button's onClick
          if (mic.buttonProps.onClick) {
            (mic.buttonProps.onClick as (e: unknown) => void)(clickEvent);
          }
          break;
        }
        case "v": {
          e.preventDefault();
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
  }, [mic.buttonProps, camera.buttonProps, activeSidebar, setActiveSidebar, isFullscreen, toggleFullscreen]);
}
