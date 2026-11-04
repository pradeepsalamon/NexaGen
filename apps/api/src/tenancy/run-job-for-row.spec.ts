import { getTenantContext } from "./tenant-context";
import { runJobForRow } from "./run-job-for-row";

describe("runJobForRow", () => {
  it("runs as the row's academy", async () => {
    let seen: string | null | undefined;
    await runJobForRow("queue:spec", "tenant_a", async () => ({ tenantId: "tenant_a" }), async () => {
      seen = getTenantContext()?.tenantId;
    });
    expect(seen).toBe("tenant_a");
  });

  it("reads the row as platform", async () => {
    let source: string | null | undefined;
    await runJobForRow(
      "queue:spec",
      undefined,
      async () => {
        source = getTenantContext()?.source;
        return { tenantId: "tenant_a" };
      },
      async () => undefined
    );
    expect(source).toBe("platform");
  });

  it("drops a job whose payload names another academy", async () => {
    const run = jest.fn();
    await runJobForRow("queue:spec", "tenant_b", async () => ({ tenantId: "tenant_a" }), run);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs an old payload (no tenantId) as the row's academy, and a null row tenant as Nexa", async () => {
    const seen: Array<string | null | undefined> = [];
    const record = async () => {
      seen.push(getTenantContext()?.tenantId);
    };
    await runJobForRow("queue:spec", undefined, async () => ({ tenantId: "tenant_a" }), record);
    await runJobForRow("queue:spec", undefined, async () => ({ tenantId: null }), record);
    expect(seen).toEqual(["tenant_a", "tenant_nexa"]);
  });

  it("keeps the job's own not-found handling for a missing row", async () => {
    const run = jest.fn(async () => {
      expect(getTenantContext()?.tenantId).toBe("tenant_b");
    });
    await runJobForRow("queue:spec", "tenant_b", async () => null, run);
    expect(run).toHaveBeenCalled();
  });
});
