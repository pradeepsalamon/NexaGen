import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Transform } from "class-transformer";
import { trashEntities } from "../../prisma/soft-delete.extension";

const trashEntityLabels = trashEntities.map((entity) => entity.label);

export class TrashQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(trashEntityLabels)
  entity?: string;

  @IsOptional()
  @IsString()
  deletedById?: string;

  @IsOptional()
  @IsString()
  deletedFrom?: string;

  @IsOptional()
  @IsString()
  deletedTo?: string;

  @IsOptional()
  @IsIn(["entity", "title", "deletedAt", "deletedBy"])
  sortBy?: string;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
