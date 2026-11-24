import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  API_ROUTES,
  resendDemoInviteRequestSchema,
  type ResendDemoInviteRequest,
  type ResendDemoInviteResponse
} from "@nexa-chess/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { DemoInviteService } from "./demo-invite.service";

/**
 * Guest-facing demo routes that need no session (the join page). Public on
 * purpose: listed in `common/security/route-auth.spec.ts` PUBLIC_ROUTES.
 */
@Controller()
export class DemoGuestController {
  constructor(private readonly invites: DemoInviteService) {}

  /** Always 200 `{ accepted: true }`; see `DemoInviteService.resendInvite`. */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @Post(API_ROUTES.liveClass.demoResendInvite())
  resendDemoInvite(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(resendDemoInviteRequestSchema)) body: ResendDemoInviteRequest
  ): Promise<ResendDemoInviteResponse> {
    return this.invites.resendInvite(id, body);
  }
}
