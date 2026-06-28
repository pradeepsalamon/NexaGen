import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";
import type { CreateBatchRequest, UpdateBatchRequest } from "@nexa-gen/types";
import { BatchStatus } from "@prisma/client";

export class CreateBatchDto implements CreateBatchRequest {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  coachIds: string[] = [];

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  scheduleNotes?: string;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsEnum(BatchStatus)
  @IsOptional()
  status: BatchStatus = BatchStatus.ACTIVE;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  studentIds: string[] = [];
}

export class UpdateBatchDto implements UpdateBatchRequest {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  coachIds?: string[];

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  scheduleNotes?: string;

  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @IsEnum(BatchStatus)
  @IsOptional()
  status?: BatchStatus;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  studentIds?: string[];
}
