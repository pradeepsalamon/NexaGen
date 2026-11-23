// Imported first by the lead-capture spec: app-env, then Nexa's number with the bot OFF and
// lead capture ON (server fallback, no settings row), before AppModule reads getApiEnv().
import "../app-env";

// A fixed test-only value for signing fake webhook calls, not a real secret.
export const CAPTURE_APP_SECRET = "integration-capture-app-secret"; // nosemgrep: ajinabraham.njsscan.generic.hardcoded_secrets.node_secret
export const CAPTURE_PHONE_NUMBER_ID = "100000000000077";
/** The stubbed Graph API: nothing ever reaches Meta (and capture must never call it). */
export const CAPTURE_GRAPH_BASE = "https://graph.capture.int.test";

const OVERRIDES: Record<string, string> = {
  SUPPORT_BOT_ENABLED: "false",
  SUPPORT_CAPTURE_LEADS: "true",
  WHATSAPP_ACCESS_TOKEN: "integration-capture-token",
  WHATSAPP_API_BASE_URL: CAPTURE_GRAPH_BASE,
  WHATSAPP_APP_SECRET: CAPTURE_APP_SECRET,
  WHATSAPP_PHONE_NUMBER_ID: CAPTURE_PHONE_NUMBER_ID,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "integration-capture-verify"
};

const previous = Object.fromEntries(Object.keys(OVERRIDES).map((key) => [key, process.env[key]]));
Object.assign(process.env, OVERRIDES);

export function restoreCaptureEnv() {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
