import { createZodDto } from "nestjs-zod";
import { createClassRequestSchema } from "@nexa-gen/types";

export class CreateClassDto extends createZodDto(createClassRequestSchema) {}
