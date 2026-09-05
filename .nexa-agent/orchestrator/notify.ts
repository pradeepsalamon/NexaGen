/**
 * Email notifications for the runner's unattended path.
 *
 * The whole point of the daemon (runQueue in runner.ts) is that nobody is
 * watching it -- so the two moments a human genuinely needs to know about are
 * when a task lands at PASS_AWAITING_APPROVAL (nothing proceeds without a
 * decision only a human can make -- see the merge-approval gate in
 * orchestrator.ts#approveTask) and when one reaches FAILED on its own. Anything
 * else -- BLOCKED_RETRY, a checkpointed session, a routine step -- the runner
 * already handles by itself and does not need a human paged for it.
 *
 * Credentials are read from apps/api/.env, the same SMTP account the app's own
 * mailer (apps/api/src/mail/mail.service.ts) uses, rather than duplicated into
 * .nexa-agent/config -- one place to rotate them.
 */
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import * as path from "path";
import { DEV_ROOT } from "./paths";

const NOTIFY_TO = process.env.NEXA_AGENT_NOTIFY_EMAIL || "salamonffp@gmail.com";
const CONTROL_UI_URL = process.env.NEXA_AGENT_UI_URL || "http://localhost:8080";

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function loadSmtpConfig(): SmtpConfig | null {
  const env = readEnvFile(path.join(DEV_ROOT, "apps/api/.env"));
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  return {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || env.SMTP_USER,
  };
}

/** Best-effort: a failed or unconfigured send must never take the runner down. */
export async function notify(subject: string, body: string): Promise<void> {
  const config = loadSmtpConfig();
  if (!config) {
    console.error(`[notify] SMTP not configured in apps/api/.env -- would have sent: ${subject}`);
    return;
  }
  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    await transport.sendMail({
      from: `"Nexa Agent" <${config.from}>`,
      to: NOTIFY_TO,
      subject: `[nexa-agent] ${subject}`,
      text: body,
    });
    console.error(`[notify] sent to ${NOTIFY_TO}: ${subject}`);
  } catch (err) {
    console.error(`[notify] failed to send email: ${(err as Error).message}`);
  }
}

export function taskUrl(taskId: string): string {
  return `${CONTROL_UI_URL}/task/${taskId}`;
}
