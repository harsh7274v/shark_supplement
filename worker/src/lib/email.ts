/**
 * The mail transport.
 *
 * The SMTP client lands with Task 8. Until then every mail is written to the
 * `email_log` as skipped, so the orders and the log of the mails work
 * already. The signature does not change when the transport arrives.
 */

import type { Env } from "../env";
import type { MailMessage } from "./email-templates";

/** Where a mail goes, so the send can be written to the `email_log`. */
export interface MailContext {
  /** The order the mail belongs to, when it is an order mail. */
  orderId?: string | null;
  /** The template the mail was built from. */
  template?: string;
}

/** What happened to a mail. */
export type MailResult = "sent" | "skipped" | "failed";

/**
 * Sends a mail and writes what happened to the `email_log`.
 *
 * The stub has no SMTP server to talk to, so the mail is skipped; Task 8
 * replaces the body with the real transport.
 */
export async function sendMail(
  env: Env,
  msg: MailMessage,
  context: MailContext = {},
): Promise<MailResult> {
  await env.DB.prepare(
    `INSERT INTO email_log (id, order_id, to_email, template, status)
     VALUES (?, ?, ?, ?, 'skipped')`,
  )
    .bind(
      `mail_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      context.orderId ?? null,
      msg.to,
      context.template ?? "unknown",
    )
    .run();

  return "skipped";
}
