import { NextResponse } from "next/server";
import { deleteThread, readThread, threadExists } from "@orchestrator/chat/thread";
import { fail } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!threadExists(id)) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    return NextResponse.json(readThread(id));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    deleteThread(id);
    return NextResponse.json({ deleted: id });
  } catch (e) {
    return fail(e);
  }
}
