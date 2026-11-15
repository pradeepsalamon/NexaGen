import type { PrismaService } from "../prisma/prisma.service";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ CREDENTIALS_ENCRYPTION_KEY: "spec-credentials-key-0123456789abcdef" })
}));

const ROOK = "tenant_rook";

function reloadingService() {
  const state: {
    fail: boolean;
    rows: Array<{
      accessTokenEncrypted: string | null;
      appSecretEncrypted?: string | null;
      phoneNumberId: string | null;
      tenantId: string;
      webhookKey?: string | null;
    }>;
  } = { fail: false, rows: [] };
  const prisma = {
    whatsAppSettings: {
      findMany: async () => {
        if (state.fail) throw new Error("database unavailable");
        return state.rows;
      }
    }
  } as unknown as PrismaService;
  const service = new WhatsAppCredentialsService(prisma);
  const row = (token: string, phoneNumberId = "pn_1") => ({ accessTokenEncrypted: service.encrypt(token), phoneNumberId, tenantId: ROOK });
  return { row, service, state };
}

describe("WhatsAppCredentialsService.reloadAll", () => {
  it("picks up a token another process rotated or switched off", async () => {
    const { row, service, state } = reloadingService();
    state.rows = [row("token_old")];
    await service.onModuleInit();
    expect(service.forTenant(ROOK)?.accessToken).toBe("token_old");

    state.rows = [row("token_new")];
    await service.reloadAll();
    expect(service.forTenant(ROOK)?.accessToken).toBe("token_new");

    state.rows = [];
    await service.reloadAll();
    expect(service.forTenant(ROOK)).toBeNull();
  });

  it("keeps the tokens it had when a reload fails", async () => {
    const { row, service, state } = reloadingService();
    state.rows = [row("token_live")];
    await service.onModuleInit();
    state.fail = true;
    await service.reloadAll();
    expect(service.forTenant(ROOK)?.accessToken).toBe("token_live");
  });

  it("never returns an academy token for Nexa", async () => {
    const { row, service, state } = reloadingService();
    state.rows = [{ ...row("token_nexa"), tenantId: "tenant_nexa" }];
    await service.reloadAll();
    expect(service.forTenant("tenant_nexa")).toBeNull();
    expect(service.forTenant(null)).toBeNull();
  });
});

describe("WhatsAppCredentialsService.inboundFor", () => {
  const KEY = "rook-webhook-key-0123456789";

  it("names the academy and its app secret by webhook key", async () => {
    const { row, service, state } = reloadingService();
    state.rows = [{ ...row("token"), appSecretEncrypted: service.encrypt("rook_secret"), webhookKey: KEY }];
    await service.reloadAll();
    expect(service.inboundFor(KEY)).toEqual({ appSecret: "rook_secret", phoneNumberId: "pn_1", tenantId: ROOK });
  });

  it("knows no academy without an app secret, an unknown or malformed key, or once switched off", async () => {
    const { row, service, state } = reloadingService();
    state.rows = [{ ...row("token"), webhookKey: KEY }];
    await service.reloadAll();
    expect(service.inboundFor(KEY)).toBeNull();
    expect(service.forTenant(ROOK)?.accessToken).toBe("token"); // sending still works

    state.rows = [{ ...row("token"), appSecretEncrypted: service.encrypt("rook_secret"), webhookKey: KEY }];
    await service.reloadAll();
    expect(service.inboundFor("someone-elses-key-0123456789")).toBeNull();
    expect(service.inboundFor("../../etc")).toBeNull();

    state.rows = [];
    await service.reloadAll();
    expect(service.inboundFor(KEY)).toBeNull();
  });
});
