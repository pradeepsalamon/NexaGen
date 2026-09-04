import { NextResponse } from "next/server";
import { readState } from "@orchestrator/state";
import * as git from "@orchestrator/git";
import { fail } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const state = readState(id);
    const files = git.changedFiles(state.base_sha, state.branch);
    return NextResponse.json({
      stat: git.diffStat(state.base_sha, state.branch),
      files: files.map((f) => ({ ...f, diff: git.fileDiff(state.base_sha, state.branch, f.file) })),
    });
  } catch (e) {
    return fail(e);
  }
}
