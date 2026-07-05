import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { trashEntities } from "../../prisma/soft-delete.extension";

const trashEntityLabels = trashEntities.map((entity) => entity.label);

export class TrashItemRefDto {
  @IsIn(trashEntityLabels)
  entity!: string;

  @IsString()
  id!: string;
}

export class TrashBulkActionDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TrashItemRefDto)
  items!: TrashItemRefDto[];
}
