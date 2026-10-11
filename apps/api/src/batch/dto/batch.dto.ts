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
import type { CreateBatchRequest, UpdateBatchRequest } from "@nexa-chess/types";
import { BatchStatus, BatchType } from "@prisma/client";

export class CreateBatchDto implements CreateBatchRequest {
  @IsEnum(BatchType)
  @IsOptional()
  batchType?: BatchType | null;

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
  @IsEnum(BatchType)
  @IsOptional()
  batchType?: BatchType | null;

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
