import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [PrivacyController],
  providers: [PrivacyService]
})
export class PrivacyModule {}
