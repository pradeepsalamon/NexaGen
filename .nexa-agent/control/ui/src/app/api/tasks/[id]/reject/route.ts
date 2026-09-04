import { NextResponse } from "next/server";
import { rejectTask } from "@orchestrator/orchestrator";
import { fail, queueTask } from "../../../_lib";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const reason = body.reason?.trim();
    if (!reason) {
      return NextResponse.json({ error: "reason is required -- the fixer reads it" }, { status: 400 });
    }
    const state = rejectTask(id, reason);
    queueTask(id);
    return NextResponse.json(state);
  } catch (e) {
    return fail(e);
  }
}
