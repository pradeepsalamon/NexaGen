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
    return "Enter your email";
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : "Enter a valid email";
}

/**
 * After a blocked submit: moves focus to the first field marked invalid (`aria-invalid="true"`)
 * once React has rendered the errors the submit just revealed.
 */
export function focusFirstInvalid(form: HTMLFormElement | null | undefined) {
  if (!form) return;
  requestAnimationFrame(() => {
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

/**
 * A new password, by the API's own rule (`passwordSchema` in `@nexa-chess/types`: 8+ characters,
 * at least one letter and one number). Messages are short and human; the server's wording
 * never reaches a field.
 */
export function getNewPasswordError(touched: boolean, value: string) {
  if (!touched) return undefined;
  if (value.length === 0) return "Enter a password";
  if (value.length < 8) return "Use at least 8 characters";
  if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(value)) return "Use at least one letter and one number";
  return undefined;
}

export function getConfirmPasswordError(touched: boolean, value: string, password: string) {
  if (!touched) return undefined;
  if (value.length === 0) return "Confirm your password";
  return value === password ? undefined : "Passwords don't match";
}
