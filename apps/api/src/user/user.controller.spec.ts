import { Test, TestingModule } from "@nestjs/testing";
import type { UpdateUserRequest, UserListResponse, UserResponse } from "@nexa-gen/types";
import type { Request } from "express";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/user.dto";

type MockUserService = {
  archive: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  getById: jest.Mock;
  list: jest.Mock;
  restore: jest.Mock;
  update: jest.Mock;
};

describe("UserController", () => {
  let controller: UserController;
  let userService: MockUserService;

  const userResponse: UserResponse = {
    user: {
      avatarUrl: null,
      coachProfile: null,
      email: "test@test.com",
      firstName: "Test",
      id: "123",
      isEmailVerified: true,
      lastName: null,
      phoneNumber: null,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: null,
      timezone: "Asia/Kolkata",
      username: null
    }
  };

  beforeEach(async () => {
    userService = {
      archive: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      getById: jest.fn(),
      list: jest.fn(),
      restore: jest.fn(),
      update: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }]
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  const mockRequest = (token?: string) =>
    ({
      cookies: token ? { nexagen_access_token: token } : {}
    }) as Request;

  it("calls list", async () => {
    const response: UserListResponse = { users: [] };
    userService.list.mockResolvedValueOnce(response);

    await controller.list(mockRequest("token"));

    expect(userService.list).toHaveBeenCalledWith("token");
  });

  it("calls getById", async () => {
    userService.getById.mockResolvedValueOnce(userResponse);

    await controller.getById("123", mockRequest("token"));

    expect(userService.getById).toHaveBeenCalledWith("token", "123");
  });

  it("calls create", async () => {
    const payload: CreateUserDto = {
      email: "test@test.com",
      firstName: "Test",
      password: "Password123",
      role: "STUDENT",
      status: "ACTIVE"
    };
    userService.create.mockResolvedValueOnce(userResponse);

    await controller.create(payload, mockRequest("token"));

    expect(userService.create).toHaveBeenCalledWith("token", payload);
  });

  it("calls update", async () => {
    const payload: UpdateUserRequest = { firstName: "New" };
    userService.update.mockResolvedValueOnce(userResponse);

    await controller.update(payload, "123", mockRequest("token"));

    expect(userService.update).toHaveBeenCalledWith("token", "123", payload);
  });

  it("calls archive", async () => {
    userService.archive.mockResolvedValueOnce(userResponse);

    await controller.archive("123", mockRequest("token"));

    expect(userService.archive).toHaveBeenCalledWith("token", "123");
  });

  it("calls restore", async () => {
    userService.restore.mockResolvedValueOnce(userResponse);

    await controller.restore("123", mockRequest("token"));

    expect(userService.restore).toHaveBeenCalledWith("token", "123");
  });

  it("calls delete", async () => {
    userService.delete.mockResolvedValueOnce({ ok: true });

    await controller.delete("123", mockRequest("token"));

    expect(userService.delete).toHaveBeenCalledWith("token", "123");
  });
});
