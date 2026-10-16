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
    return parseOrBadRequest(this.schema, value);
  }
}

/**
 * The same check for a param or query parsed inside a handler. A bare
 * `schema.parse` throws a ZodError, which Nest turns into a 500 — before the
 * handler has even authenticated the caller.
 */
export function parseOrBadRequest<T>(schema: ZodType<T>, value: unknown, label = "body"): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map(
        (issue) => `${issue.path.join(".") || label}: ${issue.message}`
      )
    );
  }

  return result.data;
}
