import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";
import type { UpdateAttendancePolicy } from "@nexa-chess/types";

/**
 * Mirrors `updateAttendancePolicySchema` in @nexa-chess/types.
 * Without an explicit DTO the global ValidationPipe cannot whitelist the body,
 * which previously allowed arbitrary columns (id, isActive, name) to be written.
 */
export class UpdateAttendancePolicyDto implements UpdateAttendancePolicy {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  presentThreshold?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  lateThreshold?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  partialThreshold?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  gracePeriodMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minDurationMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  reconnectTolerance?: number;
}
