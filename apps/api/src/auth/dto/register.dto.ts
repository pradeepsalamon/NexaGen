import type { RegisterRequest } from "@nexa-chess/types";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

const referralSources = ["ads", "friend", "school", "other"] as const;

const acquisitionSources = [
  "website",
  "google",
  "instagram",
  "facebook",
  "youtube",
  "whatsapp",
  "referral",
  "school",
  "coach_referral",
  "advertisement",
  "other",
  "unknown"
] as const;

export class RegisterDto implements RegisterRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  studentName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  parentName!: string;

  @IsString()
  @Matches(/^\d+$/, { message: "Student age must be a number." })
  studentAge!: string;

  @IsOptional()
  @IsIn(referralSources)
  referralSource?: RegisterRequest["referralSource"];

  @IsOptional()
  @IsIn(acquisitionSources)
  acquisitionSource?: RegisterRequest["acquisitionSource"];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  acquisitionDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  landingReferrer?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  contactNumber!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "Password must include at least one letter and one number."
  })
  password!: string;

  @IsString()
  confirmPassword!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
