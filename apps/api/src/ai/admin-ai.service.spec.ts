import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminAiService } from "./admin-ai.service";
import type { AiRuntimeClient } from "./ai-runtime.client";
import type { AiRuntimeConfig } from "./ai-runtime.config";

jest.mock("../auth/authenticate", () => ({ authenticateUser: jest.fn() }));
import { authenticateUser } from "../auth/authenticate";

const RID = "req-12345678";

const fakeClient = () => ({ echo: jest.fn(), info: jest.fn(), readiness: jest.fn() });

const build = (enabled: boolean, client = fakeClient()) => {
  const config: AiRuntimeConfig = { enabled, secret: enabled ? "x".repeat(48) : undefined, timeoutMs: 5000, url: "http://ai-runtime:8000" };
  const service = new AdminAiService(
    {} as JwtService,
    {} as PrismaService,
    client as unknown as AiRuntimeClient,
    config
  );
  return { client, service };
};

const asRole = (role: string) => (authenticateUser as jest.Mock).mockResolvedValue({ id: "u1", role });

describe("AdminAiService", () => {
  afterEach(() => jest.resetAllMocks());

  describe("with AI disabled", () => {
    it("status reports disabled without contacting the runtime", async () => {
      asRole("SUPER_ADMIN");
      const { client, service } = build(false);
      await expect(service.status("token", RID)).resolves.toEqual({
        contractVersion: "1.0",
        enabled: false,
        tasks: ["diagnostic.echo.v1"]
      });
      expect(client.readiness).not.toHaveBeenCalled();
      expect(client.info).not.toHaveBeenCalled();
    });

    it("echo is 503 and opens no connection", async () => {
      asRole("SUPER_ADMIN");
      const { client, service } = build(false);
      await expect(service.echo("token", RID, { text: "hi" })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(client.echo).not.toHaveBeenCalled();
    });

    it.each(["STUDENT", "COACH", "ADMIN"])("a %s gets 403, not 503", async (role) => {
      asRole(role);
      const { client, service } = build(false);
      await expect(service.echo("token", RID, { text: "hi" })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.status("token", RID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.echo).not.toHaveBeenCalled();
    });

    it("an anonymous caller gets 401 before anything else", async () => {
      (authenticateUser as jest.Mock).mockRejectedValue(new UnauthorizedException());
      const { service } = build(false);
      await expect(service.echo(undefined, RID, { text: "hi" })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("with AI enabled", () => {
    it("echo returns the runtime's answer with the request id", async () => {
      asRole("SUPER_ADMIN");
      const client = fakeClient();
      client.echo.mockResolvedValue({
        contractVersion: "1.0",
        latencyMs: 2,
        model: "echo",
        modelRevision: null,
        output: { echo: "hi", length: 2 },
        provider: "mock"
      });
      const { service } = build(true, client);
      await expect(service.echo("token", RID, { text: "hi" })).resolves.toEqual({
        echo: "hi",
        latencyMs: 2,
        length: 2,
        model: "echo",
        provider: "mock",
        rid: RID
      });
      expect(client.echo).toHaveBeenCalledWith(RID, "hi");
    });

    it("a non-super-admin still never reaches the runtime", async () => {
      asRole("ADMIN");
      const { client, service } = build(true);
      await expect(service.echo("token", RID, { text: "hi" })).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.echo).not.toHaveBeenCalled();
    });

    it("status reports a reachable, ready runtime", async () => {
      asRole("SUPER_ADMIN");
      const client = fakeClient();
      client.readiness.mockResolvedValue({ providers: { mock: "ready" }, status: "ready" });
      client.info.mockResolvedValue({
        contractVersions: ["1.0"],
        providers: ["mock"],
        service: "ai-runtime",
        tasks: ["diagnostic.echo.v1"],
        version: "0.1.0"
      });
      const { service } = build(true, client);
      const status = await service.status("token", RID);
      expect(status.runtime).toEqual({ contractVersions: ["1.0"], providers: ["mock"], reachable: true, ready: true });
      expect(JSON.stringify(status)).not.toMatch(/ai-runtime:8000|secret|Bearer/i);
    });

    it("status still answers when the runtime is down", async () => {
      asRole("SUPER_ADMIN");
      const client = fakeClient();
      client.readiness.mockRejectedValue(new ServiceUnavailableException());
      client.info.mockRejectedValue(new ServiceUnavailableException());
      const { service } = build(true, client);
      await expect(service.status("token", RID)).resolves.toMatchObject({
        enabled: true,
        runtime: { reachable: false, ready: false }
      });
    });
  });
});
