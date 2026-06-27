import { NextResponse } from "next/server";

type StoredChatMessage = {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
};

const roomMessages = new Map<string, StoredChatMessage[]>();
const MAX_MESSAGES_PER_ROOM = 200;

function sanitizeRoomId(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function sanitizeSender(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 64);
}

function sanitizeBody(value: string) {
  return value.trim().slice(0, 4000);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = sanitizeRoomId(searchParams.get("roomId") ?? "");

  if (!roomId) {
    return NextResponse.json({ error: "roomId is required." }, { status: 400 });
  }

  return NextResponse.json({
    messages: roomMessages.get(roomId) ?? [],
  });
}

export async function POST(request: Request) {
  let body:
    | {
        roomId?: string;
        sender?: string;
        message?: string;
      }
    | undefined;

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const roomId = sanitizeRoomId(body?.roomId ?? "");
  const sender = sanitizeSender(body?.sender ?? "");
  const message = sanitizeBody(body?.message ?? "");

  if (!roomId || !sender || !message) {
    return NextResponse.json(
      { error: "roomId, sender, and message are required." },
      { status: 400 },
    );
  }

  const nextMessage: StoredChatMessage = {
    id: crypto.randomUUID(),
    sender,
    body: message,
    timestamp: Date.now(),
  };

  const existingMessages = roomMessages.get(roomId) ?? [];
  const updatedMessages = [...existingMessages, nextMessage].slice(
    -MAX_MESSAGES_PER_ROOM,
  );

  roomMessages.set(roomId, updatedMessages);

  return NextResponse.json({ message: nextMessage });
}
