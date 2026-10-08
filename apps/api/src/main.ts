import "./instrument";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getApiEnv } from "@nexa-chess/config/api";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap() {
  const env = getApiEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true
  });
  // JSON request + application logs (nestjs-pino); see common/logging.
  app.useLogger(app.get(Logger));
  app.flushLogs();
  configureApp(app, env);
  await app.listen(env.PORT);
}

bootstrap();
