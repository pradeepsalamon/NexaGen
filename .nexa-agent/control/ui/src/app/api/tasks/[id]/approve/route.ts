import { NextResponse } from "next/server";
import { approveTask } from "@orchestrator/orchestrator";
import { fail, queueTask } from "../../../_lib";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    // Merging is a human decision, so the record of who made it is not optional.
    const approver = body.approver?.trim();
    if (!approver) {
      return NextResponse.json({ error: "approver is required -- a merge is attributed" }, { status: 400 });
    }
    const { state, nextPhaseTaskId } = approveTask(id, approver);
    // The task declared a next_phases plan: it was just created as a new
    // PENDING task, so start it the same way any other task creation does.
    if (nextPhaseTaskId) queueTask(nextPhaseTaskId);
    return NextResponse.json({ ...state, next_phase_task_id: nextPhaseTaskId });
  } catch (e) {
    return fail(e);
  }
}
