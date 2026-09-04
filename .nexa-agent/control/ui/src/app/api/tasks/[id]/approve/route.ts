import { NextResponse } from "next/server";
import { approveTask } from "@orchestrator/orchestrator";
import { fail } from "../../../_lib";

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
    return NextResponse.json(approveTask(id, approver));
  } catch (e) {
    return fail(e);
  }
}
