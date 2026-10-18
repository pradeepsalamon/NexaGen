import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { API_ROUTES, type LoginResponse } from "@nexa-chess/types";
import { clearAuthCookies, getSessionContext, setAuthCookies } from "./auth-cookies";
import { AuthService } from "./auth.service";
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  RegisterCoachDto,
  VerifyEmailDto
} from "./dto";
import { AUTH_COOKIE_NAMES } from "./types";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post(API_ROUTES.auth.register)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() body: RegisterDto, @Req() request: Request) {
    // No auth cookies: a student account is pending until an admin approves it.
    return this.authService.register(body, getSessionContext(request));
  }

  @Post(API_ROUTES.auth.registerCoach)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerCoach(
    @Body() body: RegisterCoachDto,
    @Req() request: Request
  ) {
    // No auth cookies here: the application is pending until an admin approves it.
    return this.authService.registerCoach(body, getSessionContext(request));
  }

  @Post(API_ROUTES.auth.login)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<LoginResponse> {
    const result = await this.authService.login(body, getSessionContext(request));

    // A second factor is pending: no cookies until it is satisfied.
    if (result.kind === "mfa") {
      return { challengeToken: result.challengeToken, mfaRequired: result.mfaRequired };
    }

    setAuthCookies(response, result);

    return { user: result.user };
  }

  @Post(API_ROUTES.auth.refresh)
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    try {
      const result = await this.authService.refresh(
        request.cookies?.[AUTH_COOKIE_NAMES.refreshToken],
        getSessionContext(request)
      );

      setAuthCookies(response, result);

      return { user: result.user };
    } catch (error) {
      clearAuthCookies(response);
      throw error;
    }
  }

  @Post(API_ROUTES.auth.logout)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.logout(
      request.cookies?.[AUTH_COOKIE_NAMES.refreshToken]
    );

    clearAuthCookies(response);

    return result;
  }

  @Get(API_ROUTES.auth.me)
  async me(@Req() request: Request) {
    return this.authService.me(request.cookies?.[AUTH_COOKIE_NAMES.accessToken]);
  }

  @Patch(API_ROUTES.auth.profile)
  // Changing the email checks the current password, so it is a guessing surface.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async updateProfile(
    @Body() body: UpdateProfileDto,
    @Req() request: Request
  ) {
    return this.authService.updateProfile(
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken],
      body
    );
  }

  @Post(API_ROUTES.auth.forgotPassword)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post(API_ROUTES.auth.resetPassword)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Post(API_ROUTES.auth.verifyEmail)
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @Post(API_ROUTES.auth.resendVerification)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Req() request: Request) {
    return this.authService.resendVerificationEmail(
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
    );
  }
}
