import { Test, TestingModule } from "@nestjs/testing";
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

type MockAuthService = {
  forgotPassword: jest.Mock;
  getCookieMaxAges: jest.Mock;
  login: jest.Mock;
  logout: jest.Mock;
  me: jest.Mock;
  refresh: jest.Mock;
  register: jest.Mock;
  resetPassword: jest.Mock;
  updateProfile: jest.Mock;
};

describe("AuthController", () => {
  let controller: AuthController;
  let authService: MockAuthService;

  const user: AuthUser = {
    avatarUrl: null,
    coachProfile: null,
    email: "test@example.com",
    firstName: "Test",
    id: "1",
    isEmailVerified: true,
    lastName: null,
    phoneNumber: null,
    role: "STUDENT",
    status: "ACTIVE",
    studentProfile: null,
    timezone: "Asia/Kolkata",
    username: null
  };

  beforeEach(async () => {
    authService = {
      forgotPassword: jest.fn(),
      getCookieMaxAges: jest.fn().mockReturnValue({
        accessToken: 3600000,
        refreshToken: 86400000
      }),
      login: jest.fn(),
      logout: jest.fn(),
      me: jest.fn(),
      refresh: jest.fn(),
      register: jest.fn(),
      resetPassword: jest.fn(),
      updateProfile: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }]
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockResponse = () => {
    const res = {} as Response;
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockRequest = (
    ip: string,
    userAgent: string,
    cookies: Record<string, string> = {}
  ) =>
    ({
      cookies,
      get: jest.fn().mockReturnValue(userAgent),
      ip
    }) as unknown as Request;

  const authResult = {
    accessToken: "access",
    accessTokenMaxAge: 3600,
    refreshToken: "refresh",
    refreshTokenMaxAge: 7200,
    user
  };

  describe("register", () => {
    it("calls authService.register without setting cookies", async () => {
      const dto: RegisterRequest = {
        confirmPassword: "password123",
        contactNumber: "1234567890",
        email: "test@example.com",
        referralSource: "friend",
        parentName: "Parent",
        password: "password123",
        studentAge: "10",
        studentName: "Test Student"
      };
      const req = mockRequest("127.0.0.1", "test-agent");
      const pending = { email: dto.email, status: "PENDING_APPROVAL" as const };

      authService.register.mockResolvedValueOnce(pending);

      const result = await controller.register(dto, req);

      expect(authService.register).toHaveBeenCalledWith(dto, {
        ipAddress: "127.0.0.1",
        userAgent: "test-agent"
      });
      expect(result).toEqual(pending);
    });
  });

  describe("login", () => {
    it("calls authService.login and sets cookies", async () => {
      const dto: LoginRequest = {
        email: "test@example.com",
        password: "pwd",
        rememberMe: false
      };
      const req = mockRequest("127.0.0.1", "test-agent");
      const res = mockResponse();

      authService.login.mockResolvedValueOnce(authResult);

      const result = await controller.login(dto, req, res);

      expect(authService.login).toHaveBeenCalledWith(dto, {
        ipAddress: "127.0.0.1",
        userAgent: "test-agent"
      });
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result.user).toBeDefined();
    });
  });

  describe("logout", () => {
    it("calls authService.logout and clears cookies", async () => {
      const req = mockRequest("127.0.0.1", "test-agent", {
        nexa_refresh_token: "some-token"
      });
      const res = mockResponse();

      authService.logout.mockResolvedValueOnce({ ok: true });

      await controller.logout(req, res);

      expect(authService.logout).toHaveBeenCalledWith("some-token");
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe("me", () => {
    it("calls authService.me with access token", async () => {
      const req = mockRequest("127.0.0.1", "test-agent", {
        nexa_access_token: "access-token"
      });
      const response: AuthResponse = { user };

      authService.me.mockResolvedValueOnce(response);

      const result = await controller.me(req);

      expect(authService.me).toHaveBeenCalledWith("access-token");
      expect(result).toBe(response);
    });
  });
});
