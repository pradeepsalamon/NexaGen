import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { verifyAccessToken } from "../../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../../auth/types";

/**
 * Put BEFORE `FileInterceptor` on upload routes: multer buffers the whole body
 * into memory, and the handler's own auth only runs after that. This checks the
 * access token's signature (no DB) so an anonymous request is a 401 before any
 * bytes are read. The handler still calls `authenticateUser` for the real check.
 */
@Injectable()
export class RequireAccessTokenInterceptor implements NestInterceptor {
  constructor(private readonly jwtService: JwtService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    await verifyAccessToken(this.jwtService, request.cookies?.[AUTH_COOKIE_NAMES.accessToken]);
    return next.handle();
  }
}
