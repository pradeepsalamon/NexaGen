import type { LoginRequest } from "@nexa-chess/types";
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
