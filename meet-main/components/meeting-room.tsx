"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { LoaderCircle, Video } from "lucide-react";
import { DisconnectReason } from "livekit-client";

import { MeetingControls } from "@/components/meeting-controls";
import { MeetingChat } from "@/components/meeting-chat";
import {
  ActivePartialScreenShare,
  PartialScreenShareModal,
} from "@/components/PartialScreenShareModal";
import { ThemeToggle } from "@/components/theme-toggle";
import { VideoGrid } from "@/components/video-grid";
import { Button } from "@/components/ui/button";
import { getConnectionStatusLabel } from "@/lib/meeting";

type MeetingRoomProps = {
  roomId: string;
  userName?: string;
};

type TokenResponse = {
  token: string;
  serverUrl: string;
};

function isIgnorableRoomError(message: string) {
  const normalized = message.trim().toLowerCase();

  return (
    normalized === "client initiated disconnect" ||
    normalized.includes("disconnect")
  );
}

export function MeetingRoom({ roomId, userName }: MeetingRoomProps) {
  const hasUserName = Boolean(userName?.trim());
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasUserName);

  useEffect(() => {
    if (!hasUserName) {
      return;
    }

    let isMounted = true;

    async function fetchToken() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomName: roomId,
            userName,
          }),
        });

        const data = (await response.json()) as Partial<TokenResponse> & {
          error?: string;
        };

        if (!response.ok || !data.token || !data.serverUrl) {
          throw new Error(data.error ?? "Unable to connect to the meeting.");
        }

        if (isMounted) {
          setTokenData({
            token: data.token,
            serverUrl: data.serverUrl,
          });
        }
      } catch (tokenError) {
        if (isMounted) {
          setError(
            tokenError instanceof Error
              ? tokenError.message
              : "Unable to join this meeting.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [hasUserName, roomId, userName]);

  if (!hasUserName) {
    return (
      <MeetingState
        title="Missing display name"
        message="Please return home, enter your display name, and join again."
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return <MeetingState message="Generating your LiveKit access token..." />;
  }

  if (error || !tokenData) {
    return (
      <MeetingState
        title="Could not join meeting"
        message={error ?? "Missing meeting token."}
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    );
  }

  return (
    <LiveKitRoom
      token={tokenData.token}
      serverUrl={tokenData.serverUrl}
      connect
      audio={false}
      video={false}
      className="flex min-h-screen flex-col"
      data-lk-theme="default"
      onConnected={() => {
        setError(null);
      }}
      onDisconnected={(reason) => {
        if (!reason || reason === DisconnectReason.CLIENT_INITIATED) {
          return;
        }

        setError(`Disconnected: ${reason}`);
      }}
      onError={(roomError) => {
        if (isIgnorableRoomError(roomError.message)) {
          return;
        }

        setError(roomError.message);
      }}
    >
      <MeetingShell roomId={roomId} userName={userName ?? "Guest"} />
    </LiveKitRoom>
  );
}

function MeetingShell({
  roomId,
  userName,
}: {
  roomId: string;
  userName: string;
}) {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const activePartialShareRef = useRef<ActivePartialScreenShare | null>(null);
  const [isPartialShareModalOpen, setIsPartialShareModalOpen] = useState(false);
  const [isPartialShareActive, setIsPartialShareActive] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const {
    localParticipant,
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();

  useEffect(() => {
    return () => {
      const activeShare = activePartialShareRef.current;

      if (activeShare) {
        void activeShare.stop();
      }
    };
  }, []);

  async function stopPartialShare() {
    const activeShare = activePartialShareRef.current;

    if (!activeShare) {
      return;
    }

    await activeShare.stop();
  }

  return (
    <>
      <header className="flex flex-col gap-4 border-b border-border/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Video className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">BlueRoom Session</p>
            <h1 className="text-xl font-semibold tracking-tight">{roomId}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label={getConnectionStatusLabel(connectionState)} />
          <StatusPill label={`You: ${userName}`} subtle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <VideoGrid />
          <MeetingChat
            open={isChatOpen}
            roomId={roomId}
            userName={userName}
            onClose={() => setIsChatOpen(false)}
          />
        </div>
        <div className="pb-2">
          <MeetingControls
            isCameraEnabled={isCameraEnabled}
            isMicrophoneEnabled={isMicrophoneEnabled}
            isScreenShareEnabled={isScreenShareEnabled}
            isPartialShareActive={isPartialShareActive}
            isChatOpen={isChatOpen}
            localParticipant={localParticipant}
            room={room}
            onOpenPartialShare={() => setIsPartialShareModalOpen(true)}
            onStopPartialShare={stopPartialShare}
            onToggleChat={() => setIsChatOpen((current) => !current)}
          />
        </div>
      </main>
      <RoomAudioRenderer />
      {isPartialShareModalOpen ? (
        <PartialScreenShareModal
          open={isPartialShareModalOpen}
          room={room}
          onClose={() => setIsPartialShareModalOpen(false)}
          onStarted={(session) => {
            activePartialShareRef.current = session;
            setIsPartialShareActive(true);
            setIsPartialShareModalOpen(false);
          }}
          onStopped={() => {
            activePartialShareRef.current = null;
            setIsPartialShareActive(false);
          }}
        />
      ) : null}
    </>
  );
}

function MeetingState({
  title = "Joining room",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-card/85 p-8 text-center shadow-2xl shadow-blue-950/10 backdrop-blur">
        <LoaderCircle className="mx-auto size-10 animate-spin text-primary" />
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  subtle = false,
}: {
  label: string;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-full border px-3 py-1.5 text-sm ${
        subtle
          ? "border-border/70 bg-card/80 text-muted-foreground"
          : "border-primary/20 bg-primary/10 text-primary"
      }`}
    >
      {label}
    </div>
  );
}
