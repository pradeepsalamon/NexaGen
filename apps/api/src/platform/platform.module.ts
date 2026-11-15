import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ContentPacksService } from "./content-packs.service";
import { EntitlementService } from "./entitlement.service";
import { FeatureGateGuard } from "./feature-gate.guard";
import { AcademyPlatformController, PlatformConsoleController } from "./platform-console.controller";
import { PlatformPlansService } from "./platform-plans.service";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { PlatformSupportService } from "./platform-support.service";
import { PlatformTenantsController } from "./platform-tenants.controller";
import { PlatformTenantsService } from "./platform-tenants.service";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionService } from "./subscription.service";
import { SupportVisitInterceptor } from "./support-visit.interceptor";

/**
 * SaaS plans, features and limits (docs/SAAS_PLANS.md). Global so any module
 * can inject `EntitlementService` for limit checks without importing this.
 */
@Global()
@Module({
  controllers: [
    AcademyPlatformController,
    PlatformConsoleController,
    PlatformController,
    PlatformTenantsController,
    SubscriptionController
  ],
  exports: [EntitlementService, FeatureGateGuard, PlatformSupportService],
  imports: [JwtModule.register({}), MailModule, PrismaModule],
  providers: [
    ContentPacksService,
    EntitlementService,
    FeatureGateGuard,
    PlatformPlansService,
    PlatformService,
    PlatformSubscriptionsService,
    PlatformSupportService,
    PlatformTenantsService,
    SubscriptionService,
    { provide: APP_INTERCEPTOR, useClass: SupportVisitInterceptor }
  ]
})
export class PlatformModule {}
