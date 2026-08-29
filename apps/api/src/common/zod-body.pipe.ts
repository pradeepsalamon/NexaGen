import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates a request body against a shared Zod schema from `@nexa-chess/types`
 * and surfaces the failing fields (`path: message`), rather than a bare
 * "Validation failed" (AUDIT M30).
 */
export class ZodBodyPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map(
          (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
        )
      );
    }

    return result.data;
  }
}
