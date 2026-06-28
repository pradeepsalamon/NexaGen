type ClassValue =
  | ClassValue[]
  | Record<string, boolean | null | undefined>
  | boolean
  | null
  | number
  | string
  | undefined;

export function cn(...inputs: ClassValue[]) {
  return inputs.flatMap(toClassList).filter(Boolean).join(" ");
}

function toClassList(input: ClassValue): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap(toClassList);
  }

  if (typeof input === "object") {
    return Object.entries(input)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
  }

  return [String(input)];
}
