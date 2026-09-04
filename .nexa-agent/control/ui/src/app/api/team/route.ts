import { NextResponse } from "next/server";
import { ConfigError, describeTeam, saveRoleAssignments, saveSupervisorConfig } from "@orchestrator/chat/config";
import { fail } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(describeTeam());
  } catch (e) {
    return fail(e);
  }
}

/**
 * Change who does what. `supervisor` sets the agent/model you talk to;
 * `roles` pins the agent and model for each worker role.
 *
 * Both are validated against what is actually installed before anything is
 * written -- an unknown model would otherwise surface minutes into a run, as a
 * CLI error far from its cause.
 */
export async function PUT(req: Request) {
  try {
    const { supervisor, roles } = await req.json();
    if (supervisor) saveSupervisorConfig(supervisor);
    if (Array.isArray(roles) && roles.length) saveRoleAssignments(roles);
    return NextResponse.json(describeTeam());
  } catch (e) {
    return fail(e, e instanceof ConfigError ? 400 : 500);
  }
}
