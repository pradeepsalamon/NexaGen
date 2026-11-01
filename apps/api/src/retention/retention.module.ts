import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { RetentionPolicyService } from "./retention-policy.service";
import { RetentionController } from "./retention.controller";
import { RetentionService } from "./retention.service";

@Module({
  controllers: [RetentionController],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [RetentionPolicyService, RetentionService]
})
export class RetentionModule {}
