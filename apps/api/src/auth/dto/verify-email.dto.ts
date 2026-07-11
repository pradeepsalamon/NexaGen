import type { VerifyEmailRequest } from "@nexa-gen/types";
import { IsNotEmpty, IsString } from "class-validator";

export class VerifyEmailDto implements VerifyEmailRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
