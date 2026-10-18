import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  API_ROUTES,
  type AuthResponse,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type MfaStatusResponse
} from "@nexa-chess/types";
import { clearAuthCookies, getSessionContext, setAuthCookies } from "../auth-cookies";
import { AuthService } from "../auth.service";
import { MfaDisableDto, MfaEnableDto, MfaSetupDto, MfaVerifyDto } from "../dto";
import { AUTH_COOKIE_NAMES } from "../types";
import { MfaService } from "./mfa.service";

/** Two-factor (TOTP) sign-in. Routes live under /auth, so they are throttled per IP. */
@Controller()
export class MfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfa: MfaService
  ) {}

  @Get(API_ROUTES.auth.mfa)
  async status(@Req() request: Request): Promise<MfaStatusResponse> {
    const user = await this.mfa.getAuthenticatedUser(this.getAccessToken(request));
    return this.mfa.status(user);
  }

  @Post(API_ROUTES.auth.mfaSetup)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async setup(@Body() body: MfaSetupDto, @Req() request: Request): Promise<MfaSetupResponse> {
    const { user } = await this.mfa.resolveEnrollingUser(
      this.getAccessToken(request),
      body.challengeToken
    );
    return this.mfa.beginSetup(user);
  }

  @Post(API_ROUTES.auth.mfaEnable)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async enable(
    @Body() body: MfaEnableDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<MfaEnableResponse> {
    const { challenge, user } = await this.mfa.resolveEnrollingUser(
      this.getAccessToken(request),
      body.challengeToken
    );
    const recoveryCodes = await this.mfa.enable(user.id, body.code);
    if (!challenge) return { recoveryCodes };

    // Enrollment was the second step of a login: finish it.
    const session = await this.authService.completeLogin(
      user.id,
      challenge.rememberMe,
      getSessionContext(request)
    );
    setAuthCookies(response, session);
    return { recoveryCodes, user: session.user };
  }

  @Post(API_ROUTES.auth.mfaVerify)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() body: MfaVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponse> {
    const challenge = await this.mfa.verifyChallenge(body.challengeToken, "VERIFY");
    await this.mfa.verifyCode(challenge.sub, body.code);
    const session = await this.authService.completeLogin(
      challenge.sub,
      challenge.rememberMe,
      getSessionContext(request)
    );
    setAuthCookies(response, session);
    return { user: session.user };
  }

  @Post(API_ROUTES.auth.mfaDisable)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async disable(
    @Body() body: MfaDisableDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ signedOut: boolean }> {
    const user = await this.mfa.getAuthenticatedUser(this.getAccessToken(request));
    const result = await this.mfa.disable(user, body.code);
    if (result.signedOut) clearAuthCookies(response);
    return result;
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
