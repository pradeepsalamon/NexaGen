import { createZodDto } from "nestjs-zod";
import { updateClassRequestSchema } from "@nexa-chess/types";

export class UpdateClassDto extends createZodDto(updateClassRequestSchema) {}
