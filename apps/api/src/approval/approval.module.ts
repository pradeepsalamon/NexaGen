import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { APPROVAL_HANDLERS } from "./approval-handler";
import { ApprovalController } from "./approval.controller";
import { ApprovalService } from "./approval.service";

/**
 * Generic admin approvals (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.3).
 * Register a new action by adding its handler class to `providers` and to the
 * APPROVAL_HANDLERS factory's `inject` list.
 */
@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    { provide: APPROVAL_HANDLERS, useFactory: (...handlers: unknown[]) => handlers, inject: [] }
  ],
  exports: [ApprovalService]
})
export class ApprovalModule {}
