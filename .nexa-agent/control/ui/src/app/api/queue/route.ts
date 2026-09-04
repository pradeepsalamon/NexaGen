import { NextResponse } from "next/server";
import { nextRunnable, queue } from "@orchestrator/runner";
import { currentLock } from "@orchestrator/runner-lock";
import { fail } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const held = currentLock();
    return NextResponse.json({
      running: held ? { task_id: held.task_id, pid: held.pid, since: held.acquired_at } : null,
      next: nextRunnable(),
      queue: queue(),
    });
  } catch (e) {
    return fail(e);
  }
}
