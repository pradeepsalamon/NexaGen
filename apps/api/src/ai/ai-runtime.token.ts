import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  AI_CONTRACT_MAJOR,
  type AiDataClass,
  type AiServiceScope,
  type AiServiceTokenClaims,
  type AiTaskId
} from "@nexa-chess/types";
import { AI_RUNTIME_CONFIG, type AiRuntimeConfig } from "./ai-runtime.config";

/** Token lifetime. The runtime rejects anything with exp - iat > 60. */
export const AI_SERVICE_TOKEN_TTL_SECONDS = 30;

export interface AiServiceTokenRequest {
  /** The exact bytes that will be sent; bound into the token as `bh`. */
  body?: Buffer;
  dataClass?: AiDataClass;
  rid: string;
  scope: AiServiceScope;
  task?: AiTaskId;
}

/** base64url (unpadded) SHA-256, as the runtime recomputes it over the raw body. */
export function bodyHash(body: Buffer): string {
  return createHash("sha256").update(body).digest("base64url");
}

/**
 * Mints the per-call service token for the AI runtime (PHASE1_SPEC.md §3.2).
 * It carries no user identity: NestJS has already authorized the user, and the
 * runtime only checks that this service may run this task on this body.
 */
@Injectable()
export class AiRuntimeTokenSigner {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AI_RUNTIME_CONFIG) private readonly config: AiRuntimeConfig
  ) {}

  buildClaims(request: AiServiceTokenRequest, nowSeconds = Math.floor(Date.now() / 1000)): AiServiceTokenClaims {
    return {
      aud: "ai-runtime",
      ...(request.body ? { bh: bodyHash(request.body) } : {}),
      ...(request.dataClass ? { dataClass: request.dataClass } : {}),
      exp: nowSeconds + AI_SERVICE_TOKEN_TTL_SECONDS,
      iat: nowSeconds,
      iss: "nexa-api",
      jti: randomUUID(),
      rid: request.rid,
      scope: request.scope,
      ...(request.task ? { task: request.task } : {}),
      ver: AI_CONTRACT_MAJOR
    };
  }

  async sign(request: AiServiceTokenRequest, nowSeconds?: number): Promise<string> {
    const secret = this.config.secret;
    if (!secret) {
      // Unreachable while config parsing holds; never fall back to another secret.
      throw new Error("AI_RUNTIME_SHARED_SECRET is not configured.");
    }
    return this.jwtService.signAsync(this.buildClaims(request, nowSeconds), { algorithm: "HS256", secret });
  }
}
