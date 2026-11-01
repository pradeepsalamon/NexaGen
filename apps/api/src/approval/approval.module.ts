import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { APPROVAL_HANDLERS } from "./approval-handler";
import { ApprovalController } from "./approval.controller";
import { ApprovalService } from "./approval.service";
import { ClassCancelExceptionalHandler, ClassCancelHandler } from "./handlers/class-cancel.handler";
import { LiveClassGuestStudentHandler } from "./handlers/live-class-guest-student.handler";

/**
 * Generic admin approvals (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.3).
 * Register a new action by adding its handler class to `providers` and to the
 * APPROVAL_HANDLERS factory's `inject` list.
 */
@Module({
  imports: [JwtModule.register({}), MessagingModule, PrismaModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    ClassCancelHandler,
    ClassCancelExceptionalHandler,
    LiveClassGuestStudentHandler,
    {
      provide: APPROVAL_HANDLERS,
      useFactory: (...handlers: unknown[]) => handlers,
      inject: [ClassCancelHandler, ClassCancelExceptionalHandler, LiveClassGuestStudentHandler]
    }
  ],
  exports: [ApprovalService]
})
export class ApprovalModule {}
