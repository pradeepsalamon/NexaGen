export function getFieldError(
  touched: boolean,
  value: string,
  message: string
) {
  return touched && value.trim().length === 0 ? message : undefined;
}

export function getEmailError(touched: boolean, value: string) {
  if (!touched) {
    return undefined;
  }

  if (value.trim().length === 0) {
    return "Email is required.";
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : "Enter a valid email address.";
}
