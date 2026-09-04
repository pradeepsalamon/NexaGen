import { NextResponse } from "next/server";
import { listThreads } from "@orchestrator/chat/thread";
import { sendMessage } from "@orchestrator/chat/supervisor";
import { fail } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A turn can run for a couple of minutes while the supervisor reads the repo.
export const maxDuration = 420;

export async function GET() {
  try {
    return NextResponse.json(
      listThreads().map((t) => ({
        thread_id: t.thread_id,
        title: t.title,
        updated_at: t.updated_at,
        message_count: t.messages.length,
        agent: t.agent,
        model: t.model,
      })),
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const { message, thread_id: threadId, agent, model } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const { thread, reply } = sendMessage(threadId ?? null, message, { agent, model });
    return NextResponse.json({
      thread_id: thread.thread_id,
      title: thread.title,
      agent: thread.agent,
      model: thread.model,
      reply,
    });
  } catch (e) {
    return fail(e);
  }
}
