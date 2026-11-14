import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { EntitlementService } from "./entitlement.service";
import { FeatureGateGuard } from "./feature-gate.guard";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionService } from "./subscription.service";

/**
 * SaaS plans, features and limits (docs/SAAS_PLANS.md). Global so any module
 * can inject `EntitlementService` for limit checks without importing this.
 */
@Global()
@Module({
  controllers: [PlatformController, SubscriptionController],
  exports: [EntitlementService, FeatureGateGuard],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [EntitlementService, FeatureGateGuard, PlatformService, SubscriptionService]
})
export class PlatformModule {}
