import { NextResponse } from "next/server";
import { createTask, listTasks } from "@orchestrator/state";
import { fail, queueTask } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = listTasks().sort((a, b) => b.task_id.localeCompare(a.task_id));
    return NextResponse.json(tasks);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const { prompt, roles, overrides, models } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    const state = createTask({
      summary: prompt,
      chain: roles?.length ? roles : ["backend-dev", "frontend-dev", "tester-e2e"],
      agentOverrides: overrides ?? {},
      modelOverrides: models ?? {},
    });
    const { runner } = queueTask(state.task_id);
    return NextResponse.json({ ...state, runner }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
