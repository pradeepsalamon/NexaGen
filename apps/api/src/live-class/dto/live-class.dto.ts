import { IsOptional, IsString } from "class-validator";

export class StartClassDto {
  @IsOptional()
  @IsString()
  metadata?: string;
}

export class EndClassDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
