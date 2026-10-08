import { TEST_ACCESS_SECRET as ACCESS_SECRET, TEST_ORIGIN as ORIGIN } from "./app-env";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SchedulerRegistry } from "@nestjs/schedule";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { getApiEnv } from "@nexa-chess/config/api";
import { AppModule } from "../../app.module";
import { configureApp } from "../../app.setup";
import { PrismaService } from "../../prisma/prisma.service";

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export type CallResult = { status: number; body: unknown };

/**
 * Boots the real AppModule (every controller, service and the production HTTP
 * pipeline) against the integration database, with crons stopped.
 */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, getApiEnv());
  await app.init();

  const scheduler = app.get(SchedulerRegistry);
  scheduler.getCronJobs().forEach((job) => job.stop());
  scheduler.getIntervals().forEach((name) => scheduler.deleteInterval(name));
  scheduler.getTimeouts().forEach((name) => scheduler.deleteTimeout(name));

  await app.listen(0, "127.0.0.1");
  const baseUrl = await app.getUrl();
  const prisma = app.get(PrismaService);
  const jwt = new JwtService();

  const tokenFor = (user: Pick<User, "email" | "id" | "role">) =>
    jwt.signAsync(
      { email: user.email, role: user.role, sessionId: `int-${user.id}`, sub: user.id, type: "access" },
      { expiresIn: "15m", secret: ACCESS_SECRET }
    );

  /** Calls the API as `user` (or anonymously) with a real signed access cookie. */
  const call = async (
    user: Pick<User, "email" | "id" | "role"> | null,
    method: string,
    path: string,
    body?: unknown
  ): Promise<CallResult> => {
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (user) headers.Cookie = `nexa_access_token=${await tokenFor(user)}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${baseUrl.replace("[::1]", "127.0.0.1")}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON body (HTML invoice, PDF)
    }
    return { body: parsed, status: res.status };
  };

  return { app, baseUrl, call, close: () => app.close(), prisma, tokenFor };
}
