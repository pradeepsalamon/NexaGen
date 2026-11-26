import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { WeeklyReportController } from "./weekly-report.controller";
import { WeeklyReportJob } from "./weekly-report.job";
import { WeeklyReportService } from "./weekly-report.service";

@Module({
  controllers: [WeeklyReportController],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [WeeklyReportJob, WeeklyReportService]
})
export class WeeklyReportModule {}
