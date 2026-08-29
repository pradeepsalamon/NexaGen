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
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { API_ROUTES } from "@nexa-chess/types";
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
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_PATHS } from "./types";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post(API_ROUTES.auth.register)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.register(
      body,
      this.getSessionContext(request)
    );

    this.setAuthCookies(response, result);

    return { user: result.user };
  }

  @Post(API_ROUTES.auth.registerCoach)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerCoach(
    @Body() body: RegisterCoachDto,
    @Req() request: Request
  ) {
    // No auth cookies here: the application is pending until an admin approves it.
    return this.authService.registerCoach(body, this.getSessionContext(request));
  }

  @Post(API_ROUTES.auth.login)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(
      body,
      this.getSessionContext(request)
    );

    this.setAuthCookies(response, result);

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
        this.getSessionContext(request)
      );

      this.setAuthCookies(response, result);

      return { user: result.user };
    } catch (error) {
      this.clearAuthCookies(response);
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

    this.clearAuthCookies(response);

    return result;
  }

  @Get(API_ROUTES.auth.me)
  async me(@Req() request: Request) {
    return this.authService.me(request.cookies?.[AUTH_COOKIE_NAMES.accessToken]);
  }

  @Patch(API_ROUTES.auth.profile)
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
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Req() request: Request) {
    return this.authService.resendVerificationEmail(
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
    );
  }

  private setAuthCookies(
    response: Response,
    tokens: {
      accessToken: string;
      accessTokenMaxAge: number;
      refreshToken: string;
      refreshTokenMaxAge: number;
    }
  ) {
    const env = getApiEnv();
    const isHttps = getFrontendUrl(env).startsWith("https://");
    const sameSite = isHttps ? "none" : "lax";
    const secure = isHttps;

    response.cookie(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
      httpOnly: true,
      maxAge: tokens.accessTokenMaxAge,
      path: AUTH_COOKIE_PATHS.accessToken,
      sameSite,
      secure
    });
    response.cookie(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
      httpOnly: true,
      maxAge: tokens.refreshTokenMaxAge,
      path: AUTH_COOKIE_PATHS.refreshToken,
      sameSite,
      secure
    });
  }

  private clearAuthCookies(response: Response) {
    const env = getApiEnv();
    const isHttps = getFrontendUrl(env).startsWith("https://");
    const sameSite = isHttps ? "none" : "lax";
    const secure = isHttps;

    response.clearCookie(AUTH_COOKIE_NAMES.accessToken, {
      path: AUTH_COOKIE_PATHS.accessToken,
      sameSite,
      secure
    });
    response.clearCookie(AUTH_COOKIE_NAMES.refreshToken, {
      path: AUTH_COOKIE_PATHS.refreshToken,
      sameSite,
      secure
    });
  }

  private getSessionContext(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get("user-agent")
    };
  }
}
