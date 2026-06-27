import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"]
  });
  const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();

    response.on("finish", () => {
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
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap();
