import type { RegisterRequest } from "@nexa-gen/types";
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

const experienceLevels = ["beginner", "intermediate", "advanced"] as const;

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

  @IsIn(experienceLevels)
  experienceLevel!: RegisterRequest["experienceLevel"];

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
  @MinLength(8)
  confirmPassword!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
