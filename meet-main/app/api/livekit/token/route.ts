import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

type TokenRequestBody = {
  roomName?: string;
  userName?: string;
};

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

function sanitizeValue(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 64);
}

export async function POST(request: Request) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json(
      {
        error:
          "Missing LiveKit environment variables. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL.",
      },
      { status: 500 },
    );
  }

  let body: TokenRequestBody;

  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const roomName = sanitizeValue(body.roomName ?? "");
  const userName = sanitizeValue(body.userName ?? "");

  if (!roomName || !userName) {
    return NextResponse.json(
      { error: "roomName and userName are required." },
      { status: 400 },
    );
  }

  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `${userName}-${crypto.randomUUID().slice(0, 8)}`,
      name: userName,
      ttl: "2h",
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({
      token: await token.toJwt(),
      serverUrl: LIVEKIT_URL,
    });
  } catch (error) {
    console.error("Failed to generate LiveKit token", error);

    return NextResponse.json(
      { error: "Could not generate meeting token." },
      { status: 500 },
    );
  }
}
