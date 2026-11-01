import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { APPROVAL_HANDLERS } from "./approval-handler";
import { ApprovalOptionsService } from "./approval-options.service";
import { ApprovalController } from "./approval.controller";
import { ApprovalService } from "./approval.service";
import { RequestQueuesService } from "./request-queues.service";
import { AttendanceCorrectionHandler } from "./handlers/attendance-correction.handler";
import {
  BatchStudentEnrolHandler,
  BatchStudentRemoveHandler,
  BatchStudentTransferHandler
} from "./handlers/batch-enrolment.handler";
import { ClassCancelExceptionalHandler, ClassCancelHandler } from "./handlers/class-cancel.handler";
import { ClassExtraHandler, ClassRescheduleHandler } from "./handlers/class-change.handler";
import { ClassSubstituteHandler } from "./handlers/class-substitute.handler";
import { LiveClassGuestStudentHandler } from "./handlers/live-class-guest-student.handler";
import { LiveSettingExceptionHandler } from "./handlers/live-setting-exception.handler";

/**
 * Generic admin approvals (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.3).
 * Register a new action by adding its handler class to `providers` and to the
 * APPROVAL_HANDLERS factory's `inject` list.
 */
@Module({
  imports: [JwtModule.register({}), MessagingModule, PrismaModule, TrashModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalOptionsService,
    ApprovalService,
    AttendanceCorrectionHandler,
    BatchStudentEnrolHandler,
    BatchStudentRemoveHandler,
    BatchStudentTransferHandler,
    ClassCancelHandler,
    ClassCancelExceptionalHandler,
    ClassExtraHandler,
    ClassRescheduleHandler,
    ClassSubstituteHandler,
    LiveClassGuestStudentHandler,
    LiveSettingExceptionHandler,
    RequestQueuesService,
    {
      provide: APPROVAL_HANDLERS,
      useFactory: (...handlers: unknown[]) => handlers,
      inject: [
        AttendanceCorrectionHandler,
        BatchStudentEnrolHandler,
        BatchStudentRemoveHandler,
        BatchStudentTransferHandler,
        ClassCancelHandler,
        ClassCancelExceptionalHandler,
        ClassExtraHandler,
        ClassRescheduleHandler,
        ClassSubstituteHandler,
        LiveClassGuestStudentHandler,
        LiveSettingExceptionHandler
      ]
    }
  ],
  exports: [ApprovalService]
})
export class ApprovalModule {}
