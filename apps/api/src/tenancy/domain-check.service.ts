import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

const TOKEN_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Proves a domain reaches this deployment (docs/SAAS_MULTI_TENANCY.md §H
 * "Full domains": the console's "check" button). The console issues a token,
 * then fetches `https://<host>/api/tenant/domain-check/<token>`; only this
 * process knows the token, so a 200 echoing it means the host's `/api` rule
 * routes to us. Tokens live in memory for a minute (one API process).
 */
@Injectable()
export class DomainCheckService {
  private readonly tokens = new Map<string, number>();

  isIssued(token: string): boolean {
    const expiresAt = this.tokens.get(token);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  async check(hostname: string, scheme: "http" | "https"): Promise<{ ok: boolean; result: string }> {
    const now = Date.now();
    for (const [token, expiresAt] of this.tokens) if (expiresAt <= now) this.tokens.delete(token);
    const token = randomBytes(18).toString("base64url");
    this.tokens.set(token, now + TOKEN_TTL_MS);
    const url = `${scheme}://${hostname}/api/tenant/domain-check/${token}`;
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.status !== 200) {
        return { ok: false, result: `${url.replace(token, "…")} answered ${response.status}. Check the /api rule for this host.` };
      }
      const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
      return body?.token === token
        ? { ok: true, result: "Reaches this app over " + scheme.toUpperCase() + "." }
        : { ok: false, result: "The host answered, but not from this app. Check where its /api rule points." };
    } catch (error) {
      const reason = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : "unknown error";
      return { ok: false, result: `Couldn't reach ${hostname}: ${reason}. Check DNS and the certificate.` };
    } finally {
      this.tokens.delete(token);
    }
  }
}
