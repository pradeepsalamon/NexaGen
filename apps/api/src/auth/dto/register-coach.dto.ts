import type { RegisterCoachRequest } from "@nexa-gen/types";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

const coachTitles = ["NONE", "CM", "FM", "IM", "GM"] as const;

export class RegisterCoachDto implements RegisterCoachRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  coachName!: string;

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
  @IsIn(coachTitles)
  title!: RegisterCoachRequest["title"];

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
  @IsInt()
  @Min(0)
  @Max(80)
  yearsOfExperience?: number;
}
