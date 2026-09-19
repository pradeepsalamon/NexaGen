import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  recordManualPaymentRequestSchema
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { ManualPaymentService } from "./manual-payment.service";
import { OfflinePaymentMethodService } from "./offline-payment-method.service";
import { assertAdminOrCoach, authenticateUser } from "./payments-auth.helper";
import { safeFilename } from "./invoices.controller";

const MANUAL_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const MANUAL_ATTACHMENT_MIME_PATTERN =
  /^(image\/(png|jpe?g|webp)|application\/pdf)$/;

/**
 * Manual/offline payment recording — the one payments surface a coach may
 * touch, always scoped to their own batches (§3.2: no guards, controller
 * lifts the cookie, `assertAdminOrCoach`/the service assert the rest).
 */
@Controller()
export class ManualPaymentController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly manualPayments: ManualPaymentService,
    private readonly methods: OfflinePaymentMethodService,
    private readonly prisma: PrismaService
  ) {}

  @Get(API_ROUTES.payments.manual.methods)
  async listMethods(@Req() request: Request) {
    await this.actor(request);
    return { methods: await this.methods.list(true) };
  }

  @Get(API_ROUTES.payments.manual.batchPlans())
  async batchPlans(@Param("batchId") batchId: string, @Req() request: Request) {
    const actor = await this.actor(request);
    return this.manualPayments.listBatchPlans(actor, batchId);
  }

  @Get(API_ROUTES.payments.manual.batchStudents())
  async batchStudents(@Param("batchId") batchId: string, @Req() request: Request) {
    const actor = await this.actor(request);
    return this.manualPayments.listBatchStudents(actor, batchId);
  }

  @Post(API_ROUTES.payments.manual.record)
  @UseInterceptors(FileInterceptor("file"))
  async record(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MANUAL_ATTACHMENT_MAX_BYTES }),
          new FileTypeValidator({ fileType: MANUAL_ATTACHMENT_MIME_PATTERN })
        ]
      })
    )
    file: Express.Multer.File | undefined,
    @Body("payload") payloadRaw: string,
    @Req() request: Request
  ) {
    const actor = await this.actor(request);

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw ?? "");
    } catch {
      throw new BadRequestException("Invalid payload.");
    }
    const dto = recordManualPaymentRequestSchema.parse(parsed);

    return this.manualPayments.record(
      actor,
      dto,
      file
        ? {
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
            size: file.size
          }
        : undefined
    );
  }

  @Get(API_ROUTES.payments.manual.mine)
  async mine(@Req() request: Request) {
    const actor = await this.actor(request);
    return this.manualPayments.listMine(actor.id);
  }

  @Get(API_ROUTES.payments.manual.attachment())
  async attachment(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const actor = await this.actor(request);
    const file = await this.manualPayments.getAttachment(actor, id);
    if (!file) throw new NotFoundException("No attachment found for this record.");

    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Length", String(file.buffer.byteLength));
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${safeFilename(file.fileName)}"`
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.end(file.buffer);
  }

  private async actor(request: Request) {
    return assertAdminOrCoach(
      await authenticateUser(
        this.jwtService,
        this.prisma,
        request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
      )
    );
  }
}
