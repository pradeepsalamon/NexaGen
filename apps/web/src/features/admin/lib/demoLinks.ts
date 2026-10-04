import type { DemoClassAccessMode } from "@nexa-chess/types";

export function demoAbsoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/** The text an admin pastes into WhatsApp/email — link, plus the passcode when one is needed. */
export function demoShareText(path: string, accessMode: DemoClassAccessMode, passcode: string | null): string {
  const url = demoAbsoluteUrl(path);
  return accessMode === "PASSCODE" && passcode ? `${url}\nPasscode: ${passcode}` : url;
}
