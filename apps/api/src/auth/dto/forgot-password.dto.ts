import type { ForgotPasswordRequest } from "@nexa-gen/types";
import { IsEmail } from "class-validator";

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @IsEmail()
  email!: string;
}
