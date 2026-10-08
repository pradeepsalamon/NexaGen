import type {
  MfaDisableRequest,
  MfaEnableRequest,
  MfaSetupRequest,
  MfaVerifyRequest
} from "@nexa-chess/types";
import { IsOptional, IsString, Length, Matches } from "class-validator";

export class MfaVerifyDto implements MfaVerifyRequest {
  @IsString()
  challengeToken!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}

export class MfaSetupDto implements MfaSetupRequest {
  @IsOptional()
  @IsString()
  challengeToken?: string;
}

export class MfaEnableDto implements MfaEnableRequest {
  @IsOptional()
  @IsString()
  challengeToken?: string;

  @IsString()
  @Matches(/^\s*\d{6}\s*$/, { message: "Enter the 6-digit code from your app." })
  code!: string;
}

export class MfaDisableDto implements MfaDisableRequest {
  @IsString()
  @Length(6, 20)
  code!: string;
}
