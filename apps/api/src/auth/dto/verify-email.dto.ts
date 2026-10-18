import type { VerifyEmailRequest } from "@nexa-chess/types";
import { IsNotEmpty, IsString } from "class-validator";

export class VerifyEmailDto implements VerifyEmailRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
