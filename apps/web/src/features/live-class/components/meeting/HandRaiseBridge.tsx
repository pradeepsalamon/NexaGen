"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { toast } from "sonner";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import {
  HAND_RAISE_TOPIC,
  decodeHandRaise,
  encodeHandRaise,
  type HandRaiseMessage,
} from "../../lib/handRaise";
import { isHumanParticipant } from "../../lib/participants";
import { useRoster } from "@/features/live-class/hooks/useRoster";

function toastId(identity: string) {
  return `hand-raised-${identity}`;
}

/**
 * Carries raised hands between participants and announces them to the room.
 * Must render inside both `<LiveKitRoom>` and `<LiveClassProvider>`.
 */
export function HandRaiseBridge() {
  const { applyHandRaise, handRaised, pruneRaisedHands, setActiveSidebar } = useLiveClassState(
    "applyHandRaise",
    "handRaised",
    "pruneRaisedHands",
    "setActiveSidebar",
  );
  const { localParticipant } = useLocalParticipant();
  const participants = useRoster();
  const connectionState = useConnectionState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const localName = user
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : localParticipant?.name || "Someone";

  const sendRef = useRef<((payload: Uint8Array, opts: object) => Promise<void>) | null>(null);
  const identityRef = useRef<string | undefined>(undefined);
  identityRef.current = localParticipant?.identity;
  // Read inside the message handler so answering a late joiner's query does not
  // re-register the data channel every time the hand goes up or down.
  const handRaisedRef = useRef(false);
  const raisedAtRef = useRef(Date.now());
  const lastSentRef = useRef<boolean | null>(null);

  const broadcast = useCallback((msg: HandRaiseMessage) => {
    if (!sendRef.current) return;
    sendRef.current(encodeHandRaise(msg), { reliable: true }).catch(() => {
      // A dropped announcement self-heals: the next joiner's query re-asks.
    });
  }, []);

  const announceOwn = useCallback(
    (raised: boolean) => {
      broadcast({ type: "HAND_RAISE", name: localName, raised, at: raisedAtRef.current });
    },
    [broadcast, localName],
  );

  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: { identity?: string; name?: string } }) => {
      const decoded = decodeHandRaise(msg.payload);
      // Identity comes from the LiveKit envelope, never the payload, so nobody
      // can raise or lower someone else's hand.
      const fromIdentity = msg.from?.identity;
      if (!decoded || !fromIdentity) return;

      if (decoded.type === "HAND_RAISE_QUERY") {
        // A late joiner is asking who already has a hand up.
        if (handRaisedRef.current) announceOwn(true);
        return;
      }

      const name = decoded.name || msg.from?.name || "Someone";
      applyHandRaise({ identity: fromIdentity, name, at: decoded.at }, decoded.raised);

      if (fromIdentity === identityRef.current) return;

      if (decoded.raised) {
        toast(`${name} raised their hand`, {
          id: toastId(fromIdentity),
          duration: 6000,
          ...(isCoach
            ? { action: { label: "View", onClick: () => setActiveSidebar("participants") } }
            : {}),
        });
      } else {
        toast.dismiss(toastId(fromIdentity));
      }
    },
    [announceOwn, applyHandRaise, isCoach, setActiveSidebar],
  );

  const { send } = useDataChannel(HAND_RAISE_TOPIC, onMessage);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Announce our own changes.
  useEffect(() => {
    handRaisedRef.current = handRaised;
    if (handRaised) raisedAtRef.current = Date.now();

    const identity = identityRef.current;
    if (!identity || connectionState !== ConnectionState.Connected) return;
    // Skip the initial "not raised" so joining doesn't broadcast a no-op.
    if (lastSentRef.current === null && !handRaised) {
      lastSentRef.current = false;
      return;
    }
    if (lastSentRef.current === handRaised) return;
    lastSentRef.current = handRaised;

    applyHandRaise({ identity, name: localName, at: raisedAtRef.current }, handRaised);
    announceOwn(handRaised);

    // Confirm to the raiser too, so the click has visible feedback wherever
    // their own tile happens to be on screen.
    if (handRaised) {
      toast("Your hand is raised", {
        id: toastId(identity),
        description: "Everyone in the class can see it. Click again to lower it.",
        duration: 4000,
      });
    } else {
      toast.dismiss(toastId(identity));
    }
  }, [handRaised, connectionState, applyHandRaise, announceOwn, localName]);

  // On connect (and again after a reconnect), ask who already has a hand up and
  // re-announce our own — the data channel has no backlog to replay.
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    const timer = setTimeout(() => {
      broadcast({ type: "HAND_RAISE_QUERY" });
      if (handRaisedRef.current) announceOwn(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [connectionState, broadcast, announceOwn]);

  // Someone who leaves with their hand up must not stay in the list forever.
  useEffect(() => {
    pruneRaisedHands(participants.filter(isHumanParticipant).map((p) => p.identity));
  }, [participants, pruneRaisedHands]);

  return null;
}
