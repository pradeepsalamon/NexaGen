import { NextResponse } from "next/server";
import { readState, writeState } from "@orchestrator/state";
import { fail, queueTask } from "../../../_lib";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const state = readState(id);
    if (state.status !== "BLOCKED_RETRY") {
      return NextResponse.json({ error: `task is ${state.status}, not BLOCKED_RETRY` }, { status: 409 });
    }
    // An explicit resume overrides whatever quota timer was scheduled.
    state.resume_requested = true;
    state.retry_at = null;
    writeState(state);
    queueTask(id);
    return NextResponse.json({ resuming: id, branch: state.branch });
  } catch (e) {
    return fail(e);
  }
}
