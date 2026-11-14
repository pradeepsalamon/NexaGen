import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { type ApiEnv, getCorsOrigins } from "@nexa-chess/config/api";
import { API_ROUTES } from "@nexa-chess/types";
import * as express from "express";
import { createOriginCheckMiddleware } from "./common/security/origin-check";
import { securityHeaders } from "./common/security/security-headers";

/**
 * The HTTP pipeline shared by main.ts and the integration test app. The app
 * must be created with `bodyParser: false`.
 */
export function configureApp(app: NestExpressApplication, env: ApiEnv) {
  // Trust exactly the number of proxy hops in front of us (nginx = 1). Trusting
  // every hop lets a client spoof X-Forwarded-For and bypass IP rate limiting.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(securityHeaders);
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
  // A multi-game PGN upload is bigger than the default 100kb JSON body; this
  // route alone may send up to 2mb (PGN_IMPORT_LIMITS.maxChars + JSON escaping).
  app.use(API_ROUTES.games.importPgn, express.json({ limit: "2mb" }));
  // JSON only: the default set also parses urlencoded bodies, which is what
  // lets a cross-site <form> post fill a DTO.
  app.useBodyParser("json");
  // body-parser 2 (Express 5) leaves req.body undefined when there is no body;
  // Express 4 gave {}. Body-less POSTs (publish, archive, …) rely on {}.
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.body ??= {};
    next();
  });

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
}
