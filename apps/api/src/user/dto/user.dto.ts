import { Transform } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";
import type { CreateUserRequest, UpdateUserRequest } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";

/** Sign-in looks the email up lowercased, so it is stored that way (review A4). */
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class CreateUserDto implements CreateUserRequest {
  @Transform(normalizeEmail)
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
  password!: string;

  @IsEnum(UserRole)
  @IsOptional()
  role: UserRole = UserRole.STUDENT;

  @IsEnum(UserStatus)
  @IsOptional()
  status: UserStatus = UserStatus.ACTIVE;
}

export class UpdateUserDto implements UpdateUserRequest {
  @Transform(normalizeEmail)
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
