import type { UpdateProfileRequest } from "@nexa-chess/types";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";

const referralSources = ["ADS", "FRIEND", "SCHOOL", "OTHER"] as const;
const coachTitles = ["NONE", "CM", "FM", "IM", "GM"] as const;

export class UpdateStudentProfileDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4000)
  chessRating?: number;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(referralSources)
  referralSource?: UpdateProfileRequest["studentProfile"] extends infer T
    ? T extends { referralSource?: infer U }
      ? U
      : never
    : never;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fideId?: string;

  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  parentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  parentPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  parentRelationship?: string;
}

export class UpdateCoachProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fideId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4000)
  fideRating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  hourlyRate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  qualification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  specialization?: string;

  @IsOptional()
  @IsIn(coachTitles)
  title?: UpdateProfileRequest["coachProfile"] extends infer T
    ? T extends { title?: infer U }
      ? U
      : never
    : never;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsOfExperience?: number;
}

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCoachProfileDto)
  coachProfile?: UpdateCoachProfileDto;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateStudentProfileDto)
  studentProfile?: UpdateStudentProfileDto;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;
}
