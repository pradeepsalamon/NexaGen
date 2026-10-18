import type { ResetPasswordRequest } from "@nexa-chess/types";
import { IsString, Matches, MinLength } from "class-validator";

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "Password must include at least one letter and one number."
  })
  password!: string;

  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
