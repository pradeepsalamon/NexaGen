import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { HealthService } from "./health.service";

/** Public and unauthenticated: polled by Docker, the deploy gate and uptime monitors. */
@Controller()
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get(API_ROUTES.health.live)
  live() {
    return this.healthService.live();
  }

  @Get(API_ROUTES.health.ready)
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.healthService.ready();
    if (result.status === "unavailable") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
