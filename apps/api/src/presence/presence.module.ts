import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { PresenceController } from "./presence.controller";
import { PresenceService } from "./presence.service";

@Module({
  controllers: [PresenceController],
  imports: [JwtModule, PrismaModule],
  providers: [PresenceService]
})
export class PresenceModule {}
