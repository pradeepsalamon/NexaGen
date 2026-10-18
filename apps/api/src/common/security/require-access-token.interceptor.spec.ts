import { type CallHandler, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { of } from "rxjs";
import { AUTH_COOKIE_NAMES } from "../../auth/types";
import { RequireAccessTokenInterceptor } from "./require-access-token.interceptor";

const SECRET = "access-secret-for-tests-only-000000";
jest.mock("@nexa-chess/config/api", () => ({ getApiEnv: () => ({ JWT_ACCESS_SECRET: SECRET }) }));

describe("RequireAccessTokenInterceptor", () => {
  const jwt = new JwtService({});
  const interceptor = new RequireAccessTokenInterceptor(jwt);

  const contextWith = (cookies: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ cookies }) }) }) as unknown as ExecutionContext;

  let next: CallHandler & { handle: jest.Mock };
  beforeEach(() => {
    next = { handle: jest.fn(() => of("handled")) };
  });

  it("stops an anonymous upload before multer reads the body", async () => {
    await expect(interceptor.intercept(contextWith({}), next)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it("stops a forged or refresh-type token", async () => {
    const refresh = await jwt.signAsync({ sub: "u1", type: "refresh" }, { secret: SECRET });
    await expect(
      interceptor.intercept(contextWith({ [AUTH_COOKIE_NAMES.accessToken]: refresh }), next)
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const forged = await jwt.signAsync({ sub: "u1", type: "access" }, { secret: "wrong-secret" });
    await expect(
      interceptor.intercept(contextWith({ [AUTH_COOKIE_NAMES.accessToken]: forged }), next)
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it("lets a signed access token through to the upload", async () => {
    const token = await jwt.signAsync({ sub: "u1", type: "access" }, { secret: SECRET });
    await interceptor.intercept(contextWith({ [AUTH_COOKIE_NAMES.accessToken]: token }), next);
    expect(next.handle).toHaveBeenCalled();
  });
});
