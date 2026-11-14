import type { PrismaService } from "../prisma/prisma.service";
import { forEachTenant } from "./for-each-tenant";
import { getTenantContext } from "./tenant-context";

const prismaWith = (ids: string[]) => {
  const findMany = jest.fn().mockResolvedValue(ids.map((id) => ({ id })));
  return Object.assign({ tenant: { findMany } } as unknown as Pick<PrismaService, "tenant">, { findMany });
};

describe("forEachTenant", () => {
  it("runs the sweep once per academy inside that academy's context", async () => {
    const seen: Array<[string, string | null | undefined, string | undefined]> = [];
    const prisma = prismaWith(["tenant_a", "tenant_b"]);
    await forEachTenant(prisma, "cron:spec", async (id) => {
      await Promise.resolve();
      const context = getTenantContext();
      seen.push([id, context?.tenantId, context?.label]);
    });
    expect(seen).toEqual([
      ["tenant_a", "tenant_a", "cron:spec"],
      ["tenant_b", "tenant_b", "cron:spec"]
    ]);
    expect(prisma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { not: "DEACTIVATED" } } })
    );
  });

  it("keeps going after one academy fails, then rethrows the first error", async () => {
    const ran: string[] = [];
    await expect(
      forEachTenant(prismaWith(["tenant_a", "tenant_b"]), "cron:spec", (id) => {
        ran.push(id);
        if (id === "tenant_a") throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(ran).toEqual(["tenant_a", "tenant_b"]);
  });
});
