export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  JWT_SECRET: string;
  FRONTEND_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * The mail server of the store.
   *
   * These are secrets of the owner and they are not there in the beginning:
   * they are put in with `wrangler secret put SMTP_HOST` (and the other
   * ones). Without a host there is no mail server, so the mails are skipped
   * and written to the `email_log`, and no flow of the store breaks.
   *
   * The port is the port of the submission (587) when it is not set, and the
   * port 465 speaks TLS from the start; every other port is upgraded with
   * STARTTLS. The address the mails go out from is `SMTP_FROM`, or the user
   * of the sign in when there is no other.
   */
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
}
