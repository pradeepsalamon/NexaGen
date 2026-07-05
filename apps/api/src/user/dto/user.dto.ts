import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";
import type { CreateUserRequest, UpdateUserRequest } from "@nexa-gen/types";
import { UserRole, UserStatus } from "@prisma/client";

export class CreateUserDto implements CreateUserRequest {
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1, { message: "First name is required." })
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  lastName?: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters." })
  @IsOptional()
  password?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role: UserRole = UserRole.STUDENT;

  @IsEnum(UserStatus)
  @IsOptional()
  status: UserStatus = UserStatus.ACTIVE;
}

export class UpdateUserDto implements UpdateUserRequest {
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(255)
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(1, { message: "First name is required." })
  @MaxLength(120)
  @IsOptional()
  firstName?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  lastName?: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters." })
  @IsOptional()
  password?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}
