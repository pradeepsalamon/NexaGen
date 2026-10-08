import "./instrument";
import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getApiEnv, getCorsOrigins } from "@nexa-chess/config/api";
import { API_ROUTES } from "@nexa-chess/types";
import { Logger } from "nestjs-pino";
import * as express from "express";
import { AppModule } from "./app.module";
import { createOriginCheckMiddleware } from "./common/security/origin-check";

async function bootstrap() {
  const env = getApiEnv();
  // Body parsers are registered by hand below: JSON only. The default set also
  // parses urlencoded bodies, which is what lets a cross-site <form> post fill a DTO.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true
  });
  // JSON request + application logs (nestjs-pino); see common/logging.
  app.useLogger(app.get(Logger));
  app.flushLogs();
  // Trust exactly the number of proxy hops in front of us (nginx = 1). Trusting
  // every hop lets a client spoof X-Forwarded-For and bypass IP rate limiting.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  const corsOrigins = getCorsOrigins(env);

  const webhookPaths = [
    API_ROUTES.attendance.webhook,
    API_ROUTES.payments.webhookRazorpay,
    API_ROUTES.payments.webhookCashfree,
    API_ROUTES.payments.webhookStripe
  ];
  app.use(createOriginCheckMiddleware(corsOrigins, webhookPaths));

  // LiveKit sends 'application/webhook+json'. Parse it as raw text so we can verify the signature.
  app.use(
    "/webhooks/livekit",
    express.text({ type: "application/webhook+json" })
  );

  // Payment gateways sign the exact request body. Parse these three routes as
  // raw text BEFORE any JSON parser claims them — re-serialising JSON changes
  // the bytes and every signature check would then fail.
  for (const path of [
    API_ROUTES.payments.webhookRazorpay,
    API_ROUTES.payments.webhookCashfree,
    API_ROUTES.payments.webhookStripe
  ]) {
    app.use(path, express.text({ type: "*/*", limit: "1mb" }));
  }
  app.useBodyParser("json");

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
  await app.listen(env.PORT);
}

bootstrap();