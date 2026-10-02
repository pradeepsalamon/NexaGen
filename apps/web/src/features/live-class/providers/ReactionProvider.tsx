"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useDataChannel } from "@livekit/components-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useOptionalLiveClassState } from "./LiveClassProvider";
import {
  CELEBRATION_EMOJIS,
  REACTION_TOPIC,
  decodeReaction,
  encodeReaction,
  playReactionSound,
  type ReactionEmoji,
  type ReactionMessage,
} from "../lib/reactions";
import { useReducedMotion } from "../lib/meetingUi";

type Floating = { id: number; emoji: string; left: number; name?: string; delay: number };

type ReactionContextValue = {
  /** False for a student while the coach has turned student reactions off. */
  canReact: boolean;
  sendReaction: (emoji: ReactionEmoji) => void;
  celebrate: (name: string | null) => void;
};

/** The signed `{ role }` the API puts in every LiveKit token's metadata. */
function senderRole(from: { metadata?: string } | undefined): string | null {
  try {
    return from?.metadata ? (JSON.parse(from.metadata) as { role?: string }).role ?? null : null;
  } catch {
    return null;
  }
}

const ReactionContext = createContext<ReactionContextValue | null>(null);

const SEND_COOLDOWN_MS = 350;
const MAX_FLOATING = 40;

/**
 * Emoji reactions floating over the room (and the coach's board tab). Must
 * render inside `<LiveKitRoom>`.
 */
export function ReactionProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Someone";
  const studentReactionsOff = useOptionalLiveClassState()?.settings?.student.reactions === "DISABLED";
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);
  const canReact = isStaff || !studentReactionsOff;
  const reducedMotion = useReducedMotion();
  const [floating, setFloating] = useState<Floating[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const nextId = useRef(0);
  const lastSent = useRef(0);
  const lastSound = useRef(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const spawn = useCallback((items: Omit<Floating, "id">[]) => {
    setFloating((prev) =>
      [...prev, ...items.map((item) => ({ ...item, id: nextId.current++ }))].slice(-MAX_FLOATING),
    );
  }, []);

  const sound = useCallback((kind: "pop" | "celebrate") => {
    const now = Date.now();
    if (kind === "pop" && now - lastSound.current < 150) return;
    lastSound.current = now;
    playReactionSound(kind);
  }, []);

  const show = useCallback(
    (msg: ReactionMessage) => {
      if (msg.type === "REACTION") {
        spawn([{ emoji: msg.emoji, left: 8 + Math.random() * 84, name: msg.name, delay: 0 }]);
        sound("pop");
        return;
      }
      spawn(
        Array.from({ length: 14 }, (_, i) => ({
          emoji: CELEBRATION_EMOJIS[i % CELEBRATION_EMOJIS.length],
          left: 5 + Math.random() * 90,
          delay: Math.random() * 0.6,
        })),
      );
      const id = nextId.current++;
      setBanner({ id, text: msg.name ? `${msg.name} solved the puzzle!` : "Puzzle solved!" });
      window.setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 2600);
      sound("celebrate");
    },
    [spawn, sound],
  );

  const onMessage = useCallback(
    (packet: { payload: Uint8Array; from?: { metadata?: string } }) => {
      const msg = decodeReaction(packet.payload);
      if (!msg) return;
      // Peer packets never pass the API, so the receiver enforces the switch.
      // A puzzle-solve celebration is not a student's own reaction and still shows.
      if (msg.type === "REACTION" && studentReactionsOff && senderRole(packet.from) !== "COACH") return;
      show(msg);
    },
    [show, studentReactionsOff],
  );

  const { send } = useDataChannel(REACTION_TOPIC, onMessage);

  const broadcast = useCallback(
    (msg: ReactionMessage) => {
      show(msg);
      send?.(encodeReaction(msg), { reliable: false }).catch(() => {
        // Cosmetic — a dropped reaction isn't worth retrying.
      });
    },
    [send, show],
  );

  const sendReaction = useCallback(
    (emoji: ReactionEmoji) => {
      if (!canReact) return;
      const now = Date.now();
      if (now - lastSent.current < SEND_COOLDOWN_MS) return;
      lastSent.current = now;
      broadcast({ type: "REACTION", emoji, name: localName });
    },
    [broadcast, localName, canReact],
  );

  const celebrate = useCallback(
    (name: string | null) => broadcast({ type: "CELEBRATE", name }),
    [broadcast],
  );

  const remove = (id: number) => setFloating((prev) => prev.filter((f) => f.id !== id));

  return (
    <ReactionContext.Provider value={{ canReact, celebrate, sendReaction }}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
              <AnimatePresence>
                {banner ? (
                  <motion.div
                    key={banner.id}
                    initial={{ opacity: 0, y: -12, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-x-0 top-20 mx-auto w-fit rounded-full bg-primary px-5 py-2 text-sm font-bold text-white shadow-card"
                  >
                    🎉 {banner.text}
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {floating.map((f) => (
                <motion.div
                  key={f.id}
                  className="absolute bottom-24 flex flex-col items-center"
                  style={{ left: `${f.left}%` }}
                  initial={{ opacity: 0, y: 0, scale: 0.6 }}
                  animate={
                    reducedMotion
                      ? { opacity: [0, 1, 1, 0] }
                      : { opacity: [0, 1, 1, 0], y: -320, scale: [0.6, 1.15, 1, 1], x: [0, 12, -10, 6] }
                  }
                  transition={{ duration: 2.6, delay: f.delay, ease: "easeOut" }}
                  onAnimationComplete={() => remove(f.id)}
                >
                  <span className="text-4xl drop-shadow-md sm:text-5xl">{f.emoji}</span>
                  {f.name ? (
                    <span className="mt-0.5 max-w-[8rem] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {f.name}
                    </span>
                  ) : null}
                </motion.div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ReactionContext.Provider>
  );
}

export function useReactions() {
  return useContext(ReactionContext);
}
