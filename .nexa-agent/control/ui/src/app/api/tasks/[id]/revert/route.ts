import { NextResponse } from "next/server";
import { revertTask } from "@orchestrator/orchestrator";
import { fail } from "../../../_lib";

export const runtime = "nodejs";

/**
 * Undo a task's commits on dev_vps.
 *
 * With no per-task branch there is nothing to abandon, so this is the escape
 * hatch. It reverts rather than resets, and refuses rather than half-applies if
 * a revert conflicts with later work.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const by = body.by?.trim();
    if (!by) return NextResponse.json({ error: "by is required -- a revert is attributed" }, { status: 400 });
    return NextResponse.json(revertTask(id, by));
  } catch (e) {
    return fail(e, 409);
  }
}
