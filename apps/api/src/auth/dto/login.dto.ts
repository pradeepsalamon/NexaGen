import type { LoginRequest } from "@nexa-gen/types";
import { IsBoolean, IsEmail, IsOptional, IsString } from "class-validator";

export class LoginDto implements LoginRequest {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
