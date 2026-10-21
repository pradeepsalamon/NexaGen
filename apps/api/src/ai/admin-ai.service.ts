import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  AI_CONTRACT_VERSION,
  AI_TASK_IDS,
  type AdminAiEchoRequest,
  type AdminAiEchoResponse,
  type AdminAiRuntimeStatus,
  type AdminAiStatusResponse
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { AiRuntimeClient } from "./ai-runtime.client";
import { AI_RUNTIME_CONFIG, type AiRuntimeConfig } from "./ai-runtime.config";

/** The status page must answer quickly even when the runtime hangs. */
const STATUS_TIMEOUT_MS = 3000;

/**
 * Super-admin diagnostics for the AI runtime (PHASE1_SPEC.md §6). Order is
 * fixed: authenticate (401) → SUPER_ADMIN (403) → enabled (503) → work, so the
 * access suites see 401/403 whatever the flag says.
 */
@Injectable()
export class AdminAiService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly client: AiRuntimeClient,
    @Inject(AI_RUNTIME_CONFIG) private readonly config: AiRuntimeConfig
  ) {}

  async status(accessToken: string | undefined, rid: string): Promise<AdminAiStatusResponse> {
    await this.assertSuperAdmin(accessToken);
    const base = { contractVersion: AI_CONTRACT_VERSION, enabled: this.config.enabled, tasks: AI_TASK_IDS };
    if (!this.config.enabled) return base;
    return { ...base, runtime: await this.probeRuntime(rid) };
  }

  async echo(accessToken: string | undefined, rid: string, body: AdminAiEchoRequest): Promise<AdminAiEchoResponse> {
    await this.assertSuperAdmin(accessToken);
    this.assertEnabled();
    const result = await this.client.echo(rid, body.text);
    return {
      echo: result.output.echo,
      latencyMs: result.latencyMs,
      length: result.output.length,
      model: result.model,
      provider: result.provider,
      rid
    };
  }

  private async probeRuntime(rid: string): Promise<AdminAiRuntimeStatus> {
    const down: AdminAiRuntimeStatus = { contractVersions: [], providers: [], reachable: false, ready: false };
    try {
      const [readiness, info] = await Promise.all([
        this.client.readiness(rid, STATUS_TIMEOUT_MS),
        this.client.info(rid, STATUS_TIMEOUT_MS)
      ]);
      return {
        contractVersions: info.contractVersions,
        providers: info.providers,
        reachable: true,
        ready: readiness.status === "ready"
      };
    } catch (error) {
      // It answered, but refused us or sent something off-contract: reachable, not ready.
      if (error instanceof BadGatewayException) return { ...down, reachable: true };
      return down;
    }
  }

  private assertEnabled() {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException("AI is not enabled on this server.");
    }
  }

  private async assertSuperAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("Only Super Admins can use AI diagnostics.");
    }
    return user;
  }
}
