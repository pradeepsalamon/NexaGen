import { createZodDto } from "nestjs-zod";
import { updateClassRequestSchema } from "@nexa-gen/types";

export class UpdateClassDto extends createZodDto(updateClassRequestSchema) {}
