import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getApiEnv, getCorsOrigins } from "@nexa-chess/config/api";
import type { NextFunction, Request, Response } from "express";
import * as express from "express";
import { AppModule } from "./app.module";

const HTTP_LOG_EXCLUDED_PREFIXES = ["/stockfish", "/health"];

async function bootstrap() {
  const env = getApiEnv();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"]
  });
  const corsOrigins = getCorsOrigins(env);

  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();

    response.on("finish", () => {
      if (
        HTTP_LOG_EXCLUDED_PREFIXES.some((prefix) =>
          request.originalUrl?.startsWith(prefix)
        )
      ) {
        return;
      }

      const durationMs = Date.now() - startedAt;
      const ipAddress =
        request.ip ||
        request.socket.remoteAddress ||
        request.headers["x-forwarded-for"] ||
        "unknown";

      console.log(
        `[HTTP] ${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms - ${ipAddress}`
      );
    });

    next();
  });

  // LiveKit sends 'application/webhook+json'. Parse it as raw text so we can verify the signature.
  app.use(
    "/webhooks/livekit",
    express.text({ type: "application/webhook+json" })
  );

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );
  app.enableCors({
    credentials: true,
    origin: corsOrigins
  });
  // Trigger API deploy
  await app.listen(env.PORT);
}

bootstrap();