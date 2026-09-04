import { NextResponse } from "next/server";
import { readState, taskExists } from "@orchestrator/state";
import { fail } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!taskExists(id)) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json(readState(id));
  } catch (e) {
    return fail(e);
  }
}
