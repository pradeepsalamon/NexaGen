import { NextResponse } from "next/server";
import { readState } from "@orchestrator/state";
import { fail, startTaskAsync } from "../../../_lib";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const state = readState(id);
    if (state.status !== "BLOCKED_RETRY") {
      return NextResponse.json({ error: `task is ${state.status}, not BLOCKED_RETRY` }, { status: 409 });
    }
    startTaskAsync(id, true);
    return NextResponse.json({ resuming: id, branch: state.branch });
  } catch (e) {
    return fail(e);
  }
}
