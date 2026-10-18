import { BadRequestException } from "@nestjs/common";

// Query-string values arrive untyped: `?status=a&status=b` is an array, and an
// unknown enum value only fails inside Prisma — both used to surface as a 500
// once handed to a `where`. These turn a malformed value into a 400 instead.

/** One string value (trimmed), or undefined when absent / empty. Repeated keys are a 400. */
export function queryString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new BadRequestException(`${name}: give one value.`);
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * One value of an enum, or undefined when absent, empty or "ALL" (the list
 * screens' "no filter" option). Anything else outside the enum is a 400.
 */
export function queryEnum<T extends string>(
  value: unknown,
  allowed: readonly T[] | Record<string, T>,
  name: string
): T | undefined {
  const raw = queryString(value, name);
  if (raw === undefined || raw === "ALL") return undefined;
  const values: readonly string[] = Array.isArray(allowed) ? allowed : Object.values(allowed);
  if (!values.includes(raw)) throw new BadRequestException(`${name}: unknown value "${raw.slice(0, 40)}".`);
  return raw as T;
}

// Stricter variants (no trimming, no "ALL"), used by the list controllers.

export function optionalQueryString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new BadRequestException(`${name} must be a single value.`);
  }
  return value;
}

export function optionalQueryEnum<T extends string>(
  value: unknown,
  allowed: Readonly<Record<string, T>> | readonly T[],
  name: string
): T | undefined {
  const raw = optionalQueryString(value, name);
  if (raw === undefined) return undefined;
  const values: readonly string[] = Array.isArray(allowed) ? allowed : Object.values(allowed);
  if (!values.includes(raw)) {
    throw new BadRequestException(`${name} must be one of: ${values.join(", ")}.`);
  }
  return raw as T;
}
