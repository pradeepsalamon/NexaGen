import { NextResponse } from "next/server";
import { readState } from "@orchestrator/state";
import * as git from "@orchestrator/git";
import { fail } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The commits this task put on dev_vps -- the review artifact now that there is no branch to diff. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const state = readState(id);
    return NextResponse.json({
      branch: state.branch,
      base_sha: state.base_sha,
      commits: git.commitsSince(state.base_sha, state.branch),
    });
  } catch (e) {
    return fail(e);
  }
}
