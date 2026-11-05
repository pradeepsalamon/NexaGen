import { Module } from "@nestjs/common";
import { CspReportController } from "./csp-report.controller";
import { CspReportService } from "./csp-report.service";

@Module({
  controllers: [CspReportController],
  providers: [CspReportService]
})
export class CspReportModule {}
