import type { ApiEnv } from "@nexa-chess/config/api";
import type { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import { GatewayCredentialsService } from "./gateway-credentials.service";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ CREDENTIALS_ENCRYPTION_KEY: "spec-credentials-key-0123456789abcdef" })
}));

const ROOK = "tenant_rook";
const base = { CASHFREE_WEBHOOK_SECRET: "nexa-webhook", RAZORPAY_KEY_ID: "rzp_nexa" } as unknown as ApiEnv;

async function serviceWith(rows: Array<{ provider: string; publicKey: string; secrets: { keySecret: string; webhookSecret: string | null } }>) {
  const holder: { service?: GatewayCredentialsService } = {};
  const prisma = {
    tenantPaymentCredential: {
      findMany: async () =>
        rows.map((row) => ({ provider: row.provider, publicKey: row.publicKey, secretsEncrypted: holder.service!.encrypt(row.secrets), tenantId: ROOK }))
    }
  } as unknown as PrismaService;
  holder.service = new GatewayCredentialsService(prisma);
  await holder.service.onModuleInit();
  return holder.service;
}

describe("GatewayCredentialsService.envFor", () => {
  it("Cashfree without its own webhook secret verifies with the academy's secret key", async () => {
    const service = await serviceWith([{ provider: "CASHFREE", publicKey: "cf_app", secrets: { keySecret: "cf_secret", webhookSecret: null } }]);
    const env = await runInTenant(ROOK, "spec", async () => service.envFor(base));
    expect(env.CASHFREE_APP_ID).toBe("cf_app");
    expect(env.CASHFREE_WEBHOOK_SECRET).toBe("cf_secret");
  });

  it("an academy's own webhook secret wins, and Nexa's keys never fall through", async () => {
    const service = await serviceWith([{ provider: "CASHFREE", publicKey: "cf_app", secrets: { keySecret: "cf_secret", webhookSecret: "cf_hook" } }]);
    const env = await runInTenant(ROOK, "spec", async () => service.envFor(base));
    expect(env.CASHFREE_WEBHOOK_SECRET).toBe("cf_hook");
    expect(env.RAZORPAY_KEY_ID).toBeUndefined();
  });
});

describe("GatewayCredentialsService.reloadAll", () => {
  function reloadingService() {
    const state: { rows: Array<{ provider: string; publicKey: string; secretsEncrypted: string; tenantId: string }>; fail: boolean } = {
      fail: false,
      rows: []
    };
    const prisma = {
      tenantPaymentCredential: {
        findMany: async () => {
          if (state.fail) throw new Error("database unavailable");
          return state.rows;
        }
      }
    } as unknown as PrismaService;
    const service = new GatewayCredentialsService(prisma);
    const row = (publicKey: string, keySecret: string) => ({
      provider: "RAZORPAY",
      publicKey,
      secretsEncrypted: service.encrypt({ keySecret, webhookSecret: "hook" }),
      tenantId: ROOK
    });
    const keyId = () => runInTenant(ROOK, "spec", async () => service.envFor(base).RAZORPAY_KEY_ID);
    return { keyId, row, service, state };
  }

  it("picks up keys another process rotated or switched off", async () => {
    const { keyId, row, service, state } = reloadingService();
    state.rows = [row("rzp_old", "old_secret")];
    await service.onModuleInit();
    expect(await keyId()).toBe("rzp_old");

    state.rows = [row("rzp_new", "new_secret")];
    await service.reloadAll();
    expect(await keyId()).toBe("rzp_new");

    state.rows = [];
    await service.reloadAll();
    expect(await keyId()).toBeUndefined();
  });

  it("keeps the keys it had when a reload fails", async () => {
    const { keyId, row, service, state } = reloadingService();
    state.rows = [row("rzp_live", "live_secret")];
    await service.onModuleInit();
    state.fail = true;
    await service.reloadAll();
    expect(await keyId()).toBe("rzp_live");
  });

  it("warns about an undecryptable row once, not on every reload", async () => {
    const { service, state } = reloadingService();
    state.rows = [{ provider: "RAZORPAY", publicKey: "rzp_bad", secretsEncrypted: "not-encrypted", tenantId: ROOK }];
    const warn = jest.spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, "warn").mockImplementation(() => undefined);
    await service.reloadAll();
    await service.reloadAll();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
