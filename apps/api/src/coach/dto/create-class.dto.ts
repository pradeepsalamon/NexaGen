import { createZodDto } from "nestjs-zod";
import { createClassRequestSchema } from "@nexa-chess/types";

export class CreateClassDto extends createZodDto(createClassRequestSchema) {}
