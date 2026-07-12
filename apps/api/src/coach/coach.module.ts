import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { CoachController } from "./coach.controller";
import { CoachService } from "./coach.service";

@Module({
  controllers: [CoachController],
  imports: [JwtModule, PrismaModule],
  providers: [CoachService]
})
export class CoachModule {}
