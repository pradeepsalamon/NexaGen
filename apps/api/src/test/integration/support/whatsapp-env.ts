// Imported first by the WhatsApp support spec: app-env, then the bot's settings,
// before AppModule reads getApiEnv(). `restoreWhatsAppEnv` puts the previous values
// back so later suites in the same process never see them.
import "../app-env";

export const TEST_APP_SECRET = "integration-whatsapp-app-secret";
export const TEST_VERIFY_TOKEN = "integration-verify-token";
export const TEST_PHONE_NUMBER_ID = "100000000000001";
/** The stubbed Graph API: nothing ever reaches Meta. */
export const TEST_GRAPH_BASE = "https://graph.whatsapp.int.test";
export const ALLOWED_NUMBER = "919000000001";
export const OTHER_ALLOWED_NUMBER = "919000000002";

const OVERRIDES: Record<string, string> = {
  SUPPORT_BOT_ENABLED: "true",
  SUPPORT_TEST_NUMBERS_ALLOWLIST: `${ALLOWED_NUMBER},${OTHER_ALLOWED_NUMBER}`,
  WHATSAPP_ACCESS_TOKEN: "integration-whatsapp-token",
  WHATSAPP_API_BASE_URL: TEST_GRAPH_BASE,
  WHATSAPP_APP_SECRET: TEST_APP_SECRET,
  WHATSAPP_PHONE_NUMBER_ID: TEST_PHONE_NUMBER_ID,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: TEST_VERIFY_TOKEN
};

const previous = Object.fromEntries(Object.keys(OVERRIDES).map((key) => [key, process.env[key]]));
Object.assign(process.env, OVERRIDES);

export function restoreWhatsAppEnv() {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
