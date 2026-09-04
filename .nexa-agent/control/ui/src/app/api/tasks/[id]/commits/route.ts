import { NextResponse } from "next/server";
import { readState } from "@orchestrator/state";
import { taskCommitShas } from "@orchestrator/orchestrator";
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
      // This task's own commits, not everything since its base -- other tasks
      // and human commits land on the same branch in between.
      commits: git.describeCommits(taskCommitShas(state)),
    });
  } catch (e) {
    return fail(e);
  }
}
