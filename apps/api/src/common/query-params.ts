import { BadRequestException } from "@nestjs/common";

// Express parses a repeated key (?status=A&status=B) into an array; Prisma
// rejects that, and an unknown enum value, with a 500. These turn both into a 400.

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
