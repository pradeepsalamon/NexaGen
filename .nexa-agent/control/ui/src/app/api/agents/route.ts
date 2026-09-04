import { NextResponse } from "next/server";
import { loadAgents, loadRoles } from "@orchestrator/paths";
import { fail } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ agents: loadAgents(), roles: loadRoles() });
  } catch (e) {
    return fail(e);
  }
}
