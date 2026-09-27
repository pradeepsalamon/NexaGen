import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { StockfishAnalyzeRequest } from "@nexa-chess/types";

export class AnalyzePositionDto implements StockfishAnalyzeRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fen!: string;

  @IsOptional()
  @IsIn(["analysis", "move"])
  mode?: "analysis" | "move";
}
