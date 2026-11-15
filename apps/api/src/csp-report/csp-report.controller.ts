import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import { CspReportService } from "./csp-report.service";

/**
 * Public by design: a browser sends Content-Security-Policy violation reports
 * with no session (docs/AUTHORIZATION.md § "Authentication mechanics", CSP).
 * Nothing is stored and nothing is answered but 204, whatever the body.
 */
@Controller()
export class CspReportController {
  constructor(private readonly cspReportService: CspReportService) {}

  @Post(API_ROUTES.security.cspReport)
  @HttpCode(HttpStatus.NO_CONTENT)
  report(@Body() body: unknown): void {
    this.cspReportService.record(body);
  }
}
