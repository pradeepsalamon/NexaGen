"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Users, X, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useParticipants } from "@livekit/components-react";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { ParticipantAvatar } from "./ParticipantAvatar";

function ParticipantListItem({ participant }: { participant: any }) {
  const isMuted = !participant.isMicrophoneEnabled;
  const isCameraEnabled = participant.isCameraEnabled;
  const name = participant.name || participant.identity || "Unknown";
  
  return (
    <div className="flex items-center justify-between gap-3 p-3 hover:bg-app-soft transition-colors rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <ParticipantAvatar name={name} size="sm" className="size-8 text-[10px] shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-app-text truncate">
            {name} {participant.isLocal ? <span className="text-app-muted text-xs font-normal">(You)</span> : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 text-app-muted shrink-0">
        {isCameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4 opacity-40" />}
        {isMuted ? <MicOff className="size-4 text-red-500/80" /> : <Mic className="size-4" />}
      </div>
    </div>
  );
}

export function ParticipantsPanel() {
  const { activeSidebar, setActiveSidebar } = useLiveClassState();
  const participants = useParticipants();

  return (
    <AnimatePresence>
      {activeSidebar === "participants" && (
        <motion.aside
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex h-full w-[360px] flex-col border-l border-app-border bg-app-surface shadow-2xl z-40 max-w-full absolute right-0 top-0 bottom-0 sm:relative"
        >
          {/* Header */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-app-border px-4">
            <div className="flex items-center gap-2.5">
              <Users className="size-4 text-app-muted" />
              <h2 className="text-sm font-semibold text-app-text">Participants ({participants.length})</h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveSidebar(null)}
              className="flex size-7 items-center justify-center rounded-md text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
            <div className="flex flex-col gap-1">
              {participants.map((p) => (
                <ParticipantListItem key={p.identity} participant={p} />
              ))}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
