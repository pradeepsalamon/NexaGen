#!/usr/bin/env node
// Prints the number of LiveKit rooms that have at least one participant, so the
// capacity benchmark can refuse to start (and abort) while a class is live.
//
//   node scripts/ai/benchmark/livekit-rooms.mjs --env-file /opt/nexa-chess/NexaGen/.env [--host http://127.0.0.1:7880]
//
// Reads only LIVEKIT_API_KEY / LIVEKIT_API_SECRET from the env file. Exit 1 if
// LiveKit can't be asked: the caller treats "unknown" as "live".
import { readFileSync } from "node:fs";
import { RoomServiceClient } from "livekit-server-sdk";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const env = {};
const envFile = arg("env-file");
if (envFile) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*(LIVEKIT_API_KEY|LIVEKIT_API_SECRET)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
}
const key = process.env.LIVEKIT_API_KEY ?? env.LIVEKIT_API_KEY;
const secret = process.env.LIVEKIT_API_SECRET ?? env.LIVEKIT_API_SECRET;
if (!key || !secret) {
  console.error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET not found");
  process.exit(1);
}

try {
  const client = new RoomServiceClient(arg("host") ?? "http://127.0.0.1:7880", key, secret);
  const rooms = await client.listRooms();
  console.log(rooms.filter((r) => r.numParticipants > 0).length);
} catch (error) {
  console.error(`LiveKit query failed: ${error.message}`);
  process.exit(1);
}
