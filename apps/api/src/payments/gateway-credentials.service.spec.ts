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
