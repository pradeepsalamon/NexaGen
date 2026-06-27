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
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto
} from "./dto";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_PATHS } from "./types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
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

  @Post("login")
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

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.refresh(
      request.cookies?.[AUTH_COOKIE_NAMES.refreshToken],
      this.getSessionContext(request)
    );

    this.setAuthCookies(response, result);

    return { user: result.user };
  }

  @Post("logout")
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

  @Get("me")
  async me(@Req() request: Request) {
    return this.authService.me(request.cookies?.[AUTH_COOKIE_NAMES.accessToken]);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
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
    const isProduction = process.env.NODE_ENV === "production";
    const sameSite = isProduction ? "none" : "lax";

    response.cookie(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
      httpOnly: true,
      maxAge: tokens.accessTokenMaxAge,
      path: AUTH_COOKIE_PATHS.accessToken,
      sameSite,
      secure: isProduction
    });
    response.cookie(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
      httpOnly: true,
      maxAge: tokens.refreshTokenMaxAge,
      path: AUTH_COOKIE_PATHS.refreshToken,
      sameSite,
      secure: isProduction
    });
  }

  private clearAuthCookies(response: Response) {
    const isProduction = process.env.NODE_ENV === "production";
    const sameSite = isProduction ? "none" : "lax";

    response.clearCookie(AUTH_COOKIE_NAMES.accessToken, {
      path: AUTH_COOKIE_PATHS.accessToken,
      sameSite,
      secure: isProduction
    });
    response.clearCookie(AUTH_COOKIE_NAMES.refreshToken, {
      path: AUTH_COOKIE_PATHS.refreshToken,
      sameSite,
      secure: isProduction
    });
  }

  private getSessionContext(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get("user-agent")
    };
  }
}
