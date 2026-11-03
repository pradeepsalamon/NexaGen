"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Users,
  Settings,
  MessageSquareText,
  Hand,
  Maximize,
  Minimize,
  Circle,
  PictureInPicture2,
  Pin,
  PinOff,
  Puzzle as PuzzleIcon,
  SmilePlus,
  Swords,
  Trophy,
  Sparkles,
  Shapes,
  ChessKnight,
  UserCog,
} from "lucide-react";
import {
  useTrackToggle,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetingControlButton } from "./MeetingControlButton";
import { MoreControlsMenu, type MoreControlItem } from "./MoreControlsMenu";
import { ReactionPicker } from "./ReactionPicker";
import { SetupPositionControl } from "./SetupPositionControl";
import { StudentControlsList, StudentControlsMenu } from "./CoachRoomControls";
import { ControlBar, ControlBarDivider } from "../room-ui/ControlBar";
import { LeaveButton } from "../room-ui/LeaveButton";
import { DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { REACTION_EMOJIS } from "../../lib/reactions";
import { useReactions } from "../../providers/ReactionProvider";
import { COACH_BOARD_SHORTCUT_KEY, useCoachBoardActions } from "../../lib/coachBoardShortcuts";
import { ignoreDeviceError } from "../../lib/mediaDevices";
import { useOptionalPip } from "../../providers/PipProvider";
import { LeaveClassControl } from "./LeaveClassControl";
import { InteractivesGrid, InteractivesLauncher } from "./interactives/InteractivesLauncher";
import { StudentInteractivesControl, usePresentedTool } from "./interactives/PresentedInteractive";
import { useOptionalInteractives } from "./interactives/InteractivesProvider";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useOptionalMatch } from "../../providers/MatchProvider";
import { useOptionalSimul } from "../../providers/SimulProvider";
import { isHumanParticipant } from "../../lib/participants";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { Z, useReducedMotion } from "../../lib/meetingUi";
import { useRecordingState } from "../../hooks/useRecordingState";
import { startRecording, stopRecording, requestScreenShare, endScreenShare } from "../../api/live-class";
import { toast } from "sonner";
import { useRoster } from "@/features/live-class/hooks/useRoster";
import { useMemberClassId } from "../../providers/LiveRoomContext";
import { useIsBoardViewport } from "../../hooks/useIsBoardViewport";

export const MeetingToolbar = memo(function MeetingToolbar() {
  const roomId = useMemberClassId();
  const reducedMotion = useReducedMotion();

  const {
    activeSidebar,
    toggleSidebar,
    handRaised,
    toggleHandRaised,
    isFullscreen,
    toggleFullscreen,
    settings,
    activePuzzle,
    screenShareRequests,
    upsertScreenShareRequest,
  } = useLiveClassState(
    "activeSidebar",
    "toggleSidebar",
    "handRaised",
    "toggleHandRaised",
    "isFullscreen",
    "toggleFullscreen",
    "settings",
    "activePuzzle",
    "screenShareRequests",
    "upsertScreenShareRequest",
  );

  const { isRecording, setRecordingOverride } = useRecordingState();
  const [isTogglingRecording, setIsTogglingRecording] = useState(false);

  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  // Pre-class settings enforcement (students only; the LiveKit token already
  // withholds the capability — this just makes the button reflect that).
  const micLocked = !isCoach && settings?.student.mic === "FORCED_OFF";
  const cameraLocked = !isCoach && settings?.student.camera === "FORCED_OFF";
  const screenShareLocked =
    !isCoach && !!settings && settings.student.screenShare !== "ALLOWED";

  const { unreadCount } = useLiveClassChat();
  const simul = useOptionalSimul();
  const simulActive = simul?.simul?.status === "ACTIVE";
  const showSimul = !!simul && (simul.isManager || !!simul.myGame);
  const simulBadge = !simul
    ? 0
    : simul.isManager
      ? simul.coachOpen ? 0 : simul.coachToMove
      : simul.myGame?.turn === "STUDENT" && !simul.studentOpen && simulActive ? 1 : 0;
  const openSimul = () => {
    if (!simul) return;
    if (!simul.isManager) simul.setStudentOpen(true);
    else if (simul.simul) simul.setCoachOpen(true);
    else simul.setStartOpen(true);
  };
  const simulLabel = simul?.isManager && !simul.simul ? "Play simul" : "Simul boards";
  const match = useOptionalMatch();
  const matchActive = match?.round?.status === "ACTIVE";
  const showMatch = !!match && (match.isManager || matchActive || !!match.myGame);
  const matchBadge =
    !match || match.isManager || match.studentOpen
      ? 0
      : match.incoming.length +
        (match.myGame?.status === "ONGOING" &&
        (match.myGame.white.id === match.myId ? "white" : "black") === match.myGame.turn
          ? 1
          : 0);
  const openMatch = () => {
    if (!match) return;
    if (!match.isManager) match.setStudentOpen(true);
    else if (matchActive) match.setCoachOpen(true);
    else match.setStartOpen(true);
  };
  const matchLabel = match?.isManager && !matchActive ? "Student matches" : "Match boards";
  const pip = useOptionalPip();

  // Capture failures are reported by MediaDeviceProvider (see ignoreDeviceError).
  const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError: ignoreDeviceError });
  const camera = useTrackToggle({ source: Track.Source.Camera, onDeviceError: ignoreDeviceError });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: "include" },
    onDeviceError: (error) => {
      const dismissed =
        error.name === "NotAllowedError" &&
        /permission denied by (system|user)/i.test(error.message);
      if (dismissed) return;
      console.error("Screen share failed:", error);
      toast.error(
        error.name === "NotAllowedError"
          ? "Screen sharing is blocked by your browser or OS settings."
          : error.name === "NotSupportedError" || error.name === "DeviceUnsupportedError"
            ? "This browser doesn't support screen sharing."
            : `Couldn't start screen share: ${error.message}`,
      );
    },
  });
  const participants = useRoster();

  // Screen-share request -> coach approval (Phase 3 of pre-class settings).
  // `screenShareLocked` is the class-wide policy; an APPROVED per-student
  // override widens just this student's token grant server-side, so the
  // button behaves like the normal unlocked one once approved.
  const myScreenShareRequest = !isCoach && user?.id ? screenShareRequests[user.id] : undefined;
  const screenShareStatus = myScreenShareRequest?.status;
  const screenShareApproved = screenShareStatus === "APPROVED";
  const screenShareUnlocked = !screenShareLocked || screenShareApproved;
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const wasSharingRef = useRef(false);

  // The student's own client is the source of truth for "I stopped sharing" —
  // report it so the coach can see the grant is no longer in use.
  useEffect(() => {
    if (!screenShareApproved) {
      wasSharingRef.current = false;
      return;
    }
    if (wasSharingRef.current && !screen.enabled && roomId) {
      endScreenShare(roomId).catch(() => {
        // Best-effort — the coach can still revoke, or the class-end sweep cleans it up.
      });
    }
    wasSharingRef.current = screen.enabled;
  }, [screen.enabled, screenShareApproved, roomId]);

  const handleRequestScreenShare = async () => {
    if (!roomId || isRequestingScreenShare) return;
    setIsRequestingScreenShare(true);
    try {
      const entry = await requestScreenShare(roomId);
      upsertScreenShareRequest(entry);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request screen sharing");
    } finally {
      setIsRequestingScreenShare(false);
    }
  };

  const extractProps = <T extends { className?: string }>(props: T) => {
    const { className: _cls, ...rest } = props;
    return rest;
  };

  const handleToggleRecording = async () => {
    if (!roomId || isTogglingRecording) return;
    setIsTogglingRecording(true);
    try {
      if (isRecording) {
        await stopRecording(roomId);
        setRecordingOverride?.(false);
        toast.success("Recording stopped and saved to backup storage.");
      } else {
        await startRecording(roomId);
        setRecordingOverride?.(true);
        toast.success("Recording started successfully.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle recording");
    } finally {
      setIsTogglingRecording(false);
    }
  };

  const participantCount = participants.filter(isHumanParticipant).length;
  const reactions = useReactions();
  const canReact = !!reactions?.canReact;
  const openSetup = useCoachBoardActions((s) => s.openSetup);
  const interactives = useOptionalInteractives();
  const presentedTool = usePresentedTool();
  const wide = useIsBoardViewport();
  const [dialog, setDialog] = useState<null | "students" | "interactives">(null);
  const { ref: wrapperRef, width } = useElementWidth<HTMLDivElement>();

  // ── The optional controls, in display order. `priority` decides which stay
  // on the bar when it runs out of width (1 = kept longest); the rest go
  // under More with the same action. ──────────────────────────────────────
  const slots: Slot[] = [];

  if (wide) {
    // Screen share is unreliable in mobile browsers: laptop and tablet only.
    slots.push({
      key: "share",
      group: "media",
      priority: isCoach ? 4 : 6,
      node: screenShareUnlocked ? (
        <MeetingControlButton
          icon={<MonitorUp className="size-5" strokeWidth={1.75} />}
          label={screen.enabled ? "Stop sharing" : "Share screen"}
          variant={screen.enabled ? "active" : "default"}
          {...extractProps(screen.buttonProps)}
          disabled={screen.buttonProps.disabled}
        />
      ) : (
        <MeetingControlButton
          icon={<MonitorUp className="size-5" strokeWidth={1.75} />}
          label={
            screenShareStatus === "PENDING" ? "Request sent — waiting for approval" : "Request to share screen"
          }
          loading={isRequestingScreenShare}
          disabled={screenShareStatus === "PENDING"}
          onClick={handleRequestScreenShare}
        />
      ),
      more: {
        icon: <MonitorUp />,
        label: screenShareUnlocked
          ? screen.enabled
            ? "Stop sharing"
            : "Share screen"
          : screenShareStatus === "PENDING"
            ? "Share request sent"
            : "Request to share screen",
        onClick: () => {
          if (screenShareUnlocked) (screen.buttonProps.onClick as (() => void) | undefined)?.();
          else void handleRequestScreenShare();
        },
        active: screen.enabled,
        disabled: !screenShareUnlocked && screenShareStatus === "PENDING",
      },
    });
  }

  if (isCoach && openSetup) {
    slots.push({
      key: "setup",
      group: "media",
      priority: 5,
      node: <SetupPositionControl />,
      more: { icon: <ChessKnight />, label: `Setup position (${COACH_BOARD_SHORTCUT_KEY.setup})`, onClick: openSetup },
    });
  }

  slots.push({
    key: "chat",
    group: "comm",
    priority: isCoach ? 2 : 1,
    node: (
      <MeetingControlButton
        icon={<MessageSquareText className="size-5" strokeWidth={1.75} />}
        label={activeSidebar === "chat" ? "Close chat" : "Chat"}
        badge={unreadCount}
        variant={activeSidebar === "chat" ? "active" : "default"}
        onClick={() => toggleSidebar("chat")}
      />
    ),
    more: {
      icon: <MessageSquareText />,
      label: "Chat",
      badge: unreadCount,
      onClick: () => toggleSidebar("chat"),
      active: activeSidebar === "chat",
    },
  });

  slots.push({
    key: "people",
    group: "comm",
    priority: isCoach ? 6 : 7,
    node: (
      <MeetingControlButton
        icon={<Users className="size-5" strokeWidth={1.75} />}
        label={`People (${participantCount} in class)`}
        variant={activeSidebar === "participants" ? "active" : "default"}
        onClick={() => toggleSidebar("participants")}
      />
    ),
    more: {
      icon: <Users />,
      label: `People (${participantCount})`,
      onClick: () => toggleSidebar("participants"),
      active: activeSidebar === "participants",
    },
  });

  if (!isCoach) {
    slots.push({
      key: "hand",
      group: "comm",
      priority: 2,
      node: (
        <MeetingControlButton
          icon={<Hand className="size-5" strokeWidth={1.75} />}
          label={handRaised ? "Lower hand" : "Raise hand"}
          variant={handRaised ? "active" : "default"}
          aria-pressed={handRaised}
          onClick={toggleHandRaised}
        />
      ),
      more: { icon: <Hand />, label: handRaised ? "Lower hand" : "Raise hand", onClick: toggleHandRaised, active: handRaised },
    });
  }

  if (canReact) {
    slots.push({
      key: "reactions",
      group: "comm",
      priority: isCoach ? 7 : 3,
      node: (
        <ReactionPicker>
          <MeetingControlButton icon={<SmilePlus className="size-5" strokeWidth={1.75} />} label="Reactions" />
        </ReactionPicker>
      ),
      // Overflowed, the emoji tray heads the More menu instead.
      more: null,
    });
  }

  const puzzleBadge = activePuzzle && activeSidebar !== "puzzle" ? 1 : 0;
  slots.push({
    key: "puzzles",
    group: "activity",
    priority: isCoach ? 8 : activePuzzle ? 1.5 : 4,
    node: (
      <MeetingControlButton
        icon={<PuzzleIcon className="size-5" strokeWidth={1.75} />}
        label={activeSidebar === "puzzle" ? "Close puzzles" : activePuzzle ? "Puzzle (live)" : "Puzzles"}
        badge={puzzleBadge}
        variant={activeSidebar === "puzzle" ? "active" : "default"}
        onClick={() => toggleSidebar("puzzle")}
      />
    ),
    more: {
      icon: <PuzzleIcon />,
      label: "Puzzles",
      badge: puzzleBadge,
      onClick: () => toggleSidebar("puzzle"),
      active: activeSidebar === "puzzle",
    },
  });

  if (showSimul) {
    slots.push({
      key: "simul",
      group: "activity",
      priority: isCoach ? 9 : simulBadge ? 1.6 : 5,
      node: (
        <MeetingControlButton
          icon={<Swords className="size-5" strokeWidth={1.75} />}
          label={simulLabel}
          badge={simulBadge}
          variant={simulActive && !isCoach ? "active" : "default"}
          onClick={openSimul}
        />
      ),
      more: { icon: <Swords />, label: simulLabel, badge: simulBadge, onClick: openSimul },
    });
  }

  if (showMatch) {
    slots.push({
      key: "match",
      group: "activity",
      priority: isCoach ? 10 : matchBadge ? 1.7 : 5.5,
      node: (
        <MeetingControlButton
          icon={<Trophy className="size-5" strokeWidth={1.75} />}
          label={matchLabel}
          badge={matchBadge}
          variant={matchActive && !isCoach ? "active" : "default"}
          onClick={openMatch}
        />
      ),
      more: { icon: <Trophy />, label: matchLabel, badge: matchBadge, onClick: openMatch },
    });
  }

  if (isCoach) {
    slots.push({
      key: "interactives",
      group: "activity",
      priority: 3,
      node: <InteractivesLauncher />,
      more: { icon: <Shapes />, label: "Interactives", onClick: () => setDialog("interactives") },
    });
  } else if (presentedTool || interactives?.presenting) {
    // Students never open Interactives — they see what the coach presents.
    slots.push({
      key: "presented",
      group: "activity",
      priority: 2.5,
      node: <StudentInteractivesControl />,
      more: presentedTool
        ? {
            icon: <Shapes />,
            label: interactives?.stageOpen ? `Hide ${presentedTool.label}` : `Show ${presentedTool.label}`,
            onClick: () => interactives?.setStageOpen(!interactives.stageOpen),
            active: interactives?.stageOpen,
          }
        : null,
    });
  }

  if (isCoach && roomId) {
    slots.push({
      key: "students",
      group: "coach",
      priority: 1,
      width: width >= 1024 ? 128 : CONTROL,
      node: <StudentControlsMenu classId={roomId} />,
      more: { icon: <UserCog />, label: "Student controls", onClick: () => setDialog("students") },
    });
  }

  const shown = fitSlots(slots, width, wide);
  const inBar = slots.filter((slot) => shown.has(slot.key));
  const overflow = slots.filter((slot) => !shown.has(slot.key));
  const overflowItems = overflow.flatMap((slot) => (slot.more ? [slot.more] : []));
  const reactionsOverflowed = canReact && overflow.some((slot) => slot.key === "reactions");

  const moreItems: MoreControlItem[] = [
    ...overflowItems,
    {
      icon: <Settings />,
      label: "Settings",
      onClick: () => toggleSidebar("settings"),
      active: activeSidebar === "settings",
    },
    {
      icon: <Sparkles />,
      label: "Background and framing",
      onClick: () => {
        if (activeSidebar !== "settings") toggleSidebar("settings");
      },
    },
    {
      icon: isFullscreen ? <Minimize /> : <Maximize />,
      label: isFullscreen ? "Exit fullscreen" : "Fullscreen",
      onClick: toggleFullscreen,
    },
  ];

  // Students get a one-tap control instead.
  if (isCoach) {
    moreItems.splice(overflowItems.length, 0, {
      icon: <Hand />,
      label: handRaised ? "Lower hand" : "Raise hand",
      onClick: toggleHandRaised,
      active: handRaised,
    });
    moreItems.splice(overflowItems.length + 1, 0, {
      icon: <Circle className={cn(isRecording && "fill-app-danger text-app-danger")} />,
      label: isTogglingRecording ? "Updating recording…" : isRecording ? "Stop recording" : "Record class",
      onClick: handleToggleRecording,
      disabled: isTogglingRecording,
      active: isRecording,
    });
  }

  // Hidden where no Picture-in-Picture mechanism exists at all (Firefox),
  // rather than offering a control that silently does nothing.
  if (pip?.supported) {
    moreItems.push({
      icon: <PictureInPicture2 />,
      label: pip.active ? "Close mini player" : "Mini player",
      onClick: pip.toggle,
      active: pip.active,
    });
    moreItems.push({
      icon: pip.pinned ? <PinOff /> : <Pin />,
      label: pip.pinned ? "Close mini player in class" : "Keep mini player open",
      onClick: pip.togglePinned,
      active: pip.pinned,
    });
  }

  const groups: Group[] = ["media", "comm", "activity", "coach"];
  const rendered: ReactNode[] = [];
  for (const group of groups) {
    const members = inBar.filter((slot) => slot.group === group);
    const leading =
      group === "media"
        ? [
            <MeetingControlButton
              key="mic"
              icon={mic.enabled ? <Mic className="size-5" strokeWidth={1.75} /> : <MicOff className="size-5" strokeWidth={1.75} />}
              label={micLocked ? "Microphone turned off by the coach" : mic.enabled ? "Mute" : "Unmute"}
              shortcut="M"
              variant={mic.enabled ? "default" : "off"}
              {...extractProps(mic.buttonProps)}
              locked={micLocked}
              disabled={mic.buttonProps.disabled}
            />,
            <MeetingControlButton
              key="camera"
              icon={camera.enabled ? <Video className="size-5" strokeWidth={1.75} /> : <VideoOff className="size-5" strokeWidth={1.75} />}
              label={cameraLocked ? "Camera turned off by the coach" : camera.enabled ? "Stop video" : "Start video"}
              shortcut="V"
              variant={camera.enabled ? "default" : "off"}
              {...extractProps(camera.buttonProps)}
              locked={cameraLocked}
              disabled={camera.buttonProps.disabled}
            />,
          ]
        : [];
    if (leading.length === 0 && members.length === 0) continue;
    if (rendered.length > 0) rendered.push(<ControlBarDivider key={`divider-${group}`} />);
    rendered.push(...leading, ...members.map((slot) => <SlotNode key={slot.key}>{slot.node}</SlotNode>));
  }

  return (
    <>
      <motion.div
        ref={wrapperRef}
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-2 pb-[env(safe-area-inset-bottom)]",
          Z.toolbar,
          // On a phone the sidebar is a full-screen sheet with its own controls.
          activeSidebar && "hidden sm:flex",
        )}
        role="toolbar"
        aria-label="Class controls"
      >
        <ControlBar>
          {rendered}
          <ControlBarDivider />
          <MoreControlsMenu
            items={moreItems}
            header={
              reactionsOverflowed && reactions ? (
                <div className="grid grid-cols-4 gap-1 p-1" role="group" aria-label="Reactions">
                  {REACTION_EMOJIS.map((emoji) => (
                    <DropdownMenuItem
                      key={emoji}
                      aria-label={`React ${emoji}`}
                      className="flex h-10 justify-center rounded-chip p-0 text-xl"
                      onSelect={() => reactions.sendReaction(emoji)}
                    >
                      {emoji}
                    </DropdownMenuItem>
                  ))}
                </div>
              ) : undefined
            }
          />
          <LeaveClassControl>{(open) => <LeaveButton onClick={open} />}</LeaveClassControl>
        </ControlBar>
      </motion.div>

      {isCoach && roomId ? (
        <Dialog open={dialog === "students"} onOpenChange={(open) => setDialog(open ? "students" : null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Students</DialogTitle>
            </DialogHeader>
            <StudentControlsList classId={roomId} />
          </DialogContent>
        </Dialog>
      ) : null}
      {isCoach && interactives ? (
        <Dialog open={dialog === "interactives"} onOpenChange={(open) => setDialog(open ? "interactives" : null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Interactives</DialogTitle>
            </DialogHeader>
            <InteractivesGrid
              onChoose={(id) => {
                setDialog(null);
                interactives.openTool(id);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
});

type Group = "media" | "comm" | "activity" | "coach";

interface Slot {
  key: string;
  group: Group;
  /** Lower = kept on the bar longer. */
  priority: number;
  node: ReactNode;
  /** The same action as a More row; null when it has none (the reaction tray is handled separately). */
  more: MoreControlItem | null;
  /** Width on the bar in px, when it isn't a 44px control. */
  width?: number;
}

/** 44px controls; 4px apart on phones, 8px from tablet up. */
const CONTROL = 44;

/** Which optional controls fit beside mic, camera, More and Leave (phones: at most seven controls in all). */
function fitSlots(slots: Slot[], width: number, wide: boolean): Set<string> {
  const gap = wide ? 8 : 4;
  const leave = wide ? 104 : CONTROL;
  // Wrapper gutters (2 × 8), bar padding + border (2 × 8 + 2), three group rules on tablets and up.
  const chrome = 16 + 18 + (wide ? 3 * (1 + 4 + gap) : 0);
  let budget = width - chrome - (3 * CONTROL + leave) - 3 * gap;
  const maxOptional = wide ? Infinity : 3;
  const shown = new Set<string>();
  // Before the first measurement nothing optional is shown, so the bar never overflows on first paint.
  if (width <= 0) return shown;
  for (const slot of [...slots].sort((a, b) => a.priority - b.priority)) {
    if (shown.size >= maxOptional) break;
    const cost = (slot.width ?? CONTROL) + gap;
    if (cost > budget) continue;
    budget -= cost;
    shown.add(slot.key);
  }
  return shown;
}

/** A control that renders nothing (e.g. no reactions) must not leave a gap; `contents` keeps the bar's spacing. */
function SlotNode({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
