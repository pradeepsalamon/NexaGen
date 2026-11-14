import type { PrismaService } from "../prisma/prisma.service";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ CREDENTIALS_ENCRYPTION_KEY: "spec-credentials-key-0123456789abcdef" })
}));

const ROOK = "tenant_rook";

function reloadingService() {
  const state: {
    fail: boolean;
    rows: Array<{ accessTokenEncrypted: string | null; phoneNumberId: string | null; tenantId: string }>;
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
