/**
 * The mail transport.
 *
 * The mails go out over SMTP, straight from the Worker, over the TCP sockets
 * of `cloudflare:sockets`: there is no vendor SDK and nothing that costs
 * money. The settings of the mail server come from the environment
 * (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`); they are
 * secrets of the owner and they are not there in the beginning, so a mail
 * without a `SMTP_HOST` is skipped and written to the log, and no flow
 * breaks.
 *
 * Whatever happens, `sendMail` never throws: what happened to the mail is
 * written to the `email_log` and given back to the caller.
 */

import { connect } from "cloudflare:sockets";
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

/** The settings of the mail server. */
export interface SmtpConfig {
  /** The host of the mail server. */
  host: string;
  /** The port of the mail server. */
  port: number;
  /** The user of the sign in, when the server wants one. */
  user?: string;
  /** The password of the sign in, when the server wants one. */
  pass?: string;
  /** The address the mails go out from. */
  from: string;
}

/**
 * A transport carries a mail to the mail server.
 *
 * It throws when the mail did not go out; `sendMail` turns that into a
 * `failed` mail in the log. The transport is a parameter, so a test can put
 * a fake one in its place.
 */
export type MailTransport = (config: SmtpConfig, msg: MailMessage) => Promise<void>;

/**
 * The settings of one mail.
 */
export interface SmtpOptions {
  /** The milliseconds the mail server may take to answer. */
  timeoutMs?: number;
}

/**
 * The way a socket to the mail server is opened.
 *
 * The socket comes from `cloudflare:sockets`, and the runtime does not let a
 * test take that module away, so the factory is the seam the tests use to
 * put a fake mail server in the place of the real one.
 */
export type SocketFactory = (address: SocketAddress, options: SocketOptions) => Socket;

/** The socket of the runtime, the real mail server. */
const runtimeSockets: SocketFactory = (address, options) => connect(address, options);

/** The factory that is in use right now. */
let sockets: SocketFactory = runtimeSockets;

/**
 * Puts another way of opening a socket in the place of the real one.
 *
 * The returned function puts the old one back, so a test can put the real
 * one back when it is done with the fake.
 */
export function useSocketFactory(factory: SocketFactory): () => void {
  const previous = sockets;
  sockets = factory;
  return () => {
    sockets = previous;
  };
}

/** The port of the mail server that speaks TLS from the start. */
const IMPLICIT_TLS_PORT = 465;

/** The port of the mail server when the owner did not set one. */
const DEFAULT_SMTP_PORT = 587;

/** The milliseconds a mail server may take to answer before the mail fails. */
const SMTP_TIMEOUT_MS = 10_000;

/** The template of a mail that does not say which one it is. */
const UNKNOWN_TEMPLATE = "unknown";

/**
 * Sends a mail and writes what happened to the `email_log`.
 *
 * Without a mail server the mail is skipped, but it is still logged, so the
 * owner sees what the store would have sent. A failure of the transport is
 * caught and logged as well: a mail that cannot be sent never breaks the
 * flow it belongs to.
 *
 * The context of the mail is the third parameter, because that is where the
 * order routes put it. The transport is the fourth one: it is the way the
 * tests put a fake mail server in the place of the real one.
 */
export async function sendMail(
  env: Env,
  msg: MailMessage,
  context: MailContext = {},
  transport: MailTransport = smtpTransport,
): Promise<MailResult> {
  const config = smtpConfig(env);

  if (!config) {
    await logMail(env, msg, context, "skipped", null);
    return "skipped";
  }

  try {
    await transport(config, msg);
    await logMail(env, msg, context, "sent", null);
    return "sent";
  } catch (cause) {
    await logMail(env, msg, context, "failed", describe(cause));
    return "failed";
  }
}

/**
 * The settings of the mail server, or `null` when there is no mail server.
 *
 * The host is what decides: without it there is nowhere to send a mail, so
 * the mail is skipped. The port is the port of the submission with STARTTLS
 * when the owner did not set one, and the address the mails go out from is
 * the one of the owner, or the user of the sign in when there is no other.
 */
function smtpConfig(env: Env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) {
    return null;
  }

  const user = env.SMTP_USER?.trim() || undefined;
  const pass = env.SMTP_PASS || undefined;

  return {
    host,
    port: readPort(env.SMTP_PORT),
    user,
    pass,
    from: env.SMTP_FROM?.trim() || user || "",
  };
}

/** The port of the mail server; the port of the submission when there is none. */
function readPort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : DEFAULT_SMTP_PORT;
}

/**
 * Writes what happened to a mail to the `email_log`.
 *
 * The log is a witness, not a part of the flow: when the log itself cannot
 * be written, the mail still is what it is, so the failure only goes to the
 * console.
 */
async function logMail(
  env: Env,
  msg: MailMessage,
  context: MailContext,
  status: MailResult,
  error: string | null,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_log (id, order_id, to_email, template, status, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `mail_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        context.orderId ?? null,
        msg.to,
        context.template ?? UNKNOWN_TEMPLATE,
        status,
        error,
      )
      .run();
  } catch (cause) {
    console.error("the mail could not be written to the log", cause);
  }
}

/** The message of a failure, for the log. */
function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Waits for something, but not forever.
 *
 * A mail server that keeps quiet must not hold the flow of the store: the
 * mail becomes a failure after a while, and the flow goes on.
 */
async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("the mail server did not answer in time")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Carries a mail to the mail server over SMTP.
 *
 * The conversation is the one of every mail server: the hello, the sign in,
 * the sender, the receiver, the mail itself and the goodbye. The port 465
 * speaks TLS from the start, every other port is upgraded with STARTTLS
 * before the sign in, so the password never goes out in the open.
 */
export async function smtpTransport(
  config: SmtpConfig,
  msg: MailMessage,
  options: SmtpOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? SMTP_TIMEOUT_MS;
  const implicitTls = config.port === IMPLICIT_TLS_PORT;
  const mail = outgoing(config, msg);
  let socket = sockets(
    { hostname: config.host, port: config.port },
    { secureTransport: implicitTls ? "on" : "starttls", allowHalfOpen: false },
  );
  let connection = smtpConnection(socket, timeoutMs);

  try {
    await withTimeout(socket.opened, timeoutMs);
    const greeting = await connection.read();
    expectReply(greeting, [220], "the mail server did not greet us");

    let capabilities = await greet(connection, config);

    if (!implicitTls) {
      if (!capabilities.toUpperCase().includes("STARTTLS")) {
        throw new Error("the mail server does not offer STARTTLS");
      }

      await connection.command("STARTTLS");
      const ready = await connection.read();
      expectReply(ready, [220], "the mail server refused STARTTLS");

      // The socket of the upgrade is a new one: the old one is closed.
      socket = socket.startTls();
      connection = smtpConnection(socket, timeoutMs);
      capabilities = await greet(connection, config);
    }

    if (config.user && config.pass) {
      await connection.command(`AUTH PLAIN ${base64(`${config.user}:${config.pass}`)}`);
      const signedIn = await connection.read();
      expectReply(signedIn, [235], "the mail server refused the sign in");
    }

    await connection.command(`MAIL FROM:<${mail.from}>`);
    const sender = await connection.read();
    expectReply(sender, [250, 251], "the mail server refused the sender");

    await connection.command(`RCPT TO:<${mail.to}>`);
    const receiver = await connection.read();
    expectReply(receiver, [250, 251], "the mail server refused the receiver");

    await connection.command("DATA");
    const ready = await connection.read();
    expectReply(ready, [354], "the mail server refused the mail");

    await connection.raw(`${dotStuff(message(mail, config))}\r\n.\r\n`);
    const accepted = await connection.read();
    expectReply(accepted, [250], "the mail server did not take the mail");

    await connection.command("QUIT");
    // The mail is on its way already; the goodbye is only politeness, so a
    // mail server that hangs up on it does not make the mail a failure.
    await connection.read().catch(() => undefined);
  } finally {
    await connection.close();
  }
}

/**
 * Says hello to the mail server and returns what it can do.
 *
 * The answer holds the capabilities of the server, one per line, and the
 * last line of it carries the code of the answer.
 */
async function greet(connection: SmtpConnection, config: SmtpConfig): Promise<string> {
  await connection.command(`EHLO ${clientName(config)}`);
  const reply = await connection.read();
  expectReply(reply, [250], "the mail server did not say hello");
  return reply.text;
}

/**
 * The name the mail server knows the store by.
 *
 * The hello names the domain of the sender, the way every mail client does;
 * `localhost` is the name when the address of the sender has no domain.
 */
function clientName(config: SmtpConfig): string {
  const domain = config.from.split("@").pop()?.trim();
  return domain && domain.includes(".") ? domain : "localhost";
}

/** Throws when the mail server did not answer the way it should. */
function expectReply(reply: SmtpReply, codes: number[], what: string): void {
  if (!codes.includes(reply.code)) {
    throw new Error(`${what}: the mail server answered ${reply.code} ${reply.text}`);
  }
}

/** The answer of the mail server. */
interface SmtpReply {
  /** The code of the answer, the three digits of it. */
  code: number;
  /** The text of the answer; the lines of a long answer are joined. */
  text: string;
}

/** A socket that speaks SMTP. */
interface SmtpConnection {
  /** Writes a command; the line end is added. */
  command(line: string): Promise<void>;
  /** Writes the mail itself; the line ends are already in it. */
  raw(text: string): Promise<void>;
  /** Reads the answer of the mail server. */
  read(): Promise<SmtpReply>;
  /** Closes the socket. */
  close(): Promise<void>;
}

/**
 * Wraps a socket in the SMTP conversation.
 *
 * The answers of the mail server are read line by line: an answer can hold
 * more than one line, and the last of them carries the code.
 */
function smtpConnection(socket: Socket, timeoutMs: number): SmtpConnection {
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  async function write(text: string): Promise<void> {
    await writer.write(encoder.encode(text));
  }

  async function readLine(): Promise<string> {
    for (;;) {
      const end = buffer.indexOf("\r\n");
      if (end !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        return line;
      }

      const { value, done } = await reader.read();
      if (done) {
        throw new Error("the mail server closed the connection");
      }
      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function readReply(): Promise<SmtpReply> {
    const lines: string[] = [];

    for (;;) {
      const line = await readLine();
      const match = /^(\d{3})(?:([ -])(.*))?$/.exec(line);
      if (!match) {
        continue;
      }

      lines.push(match[3] ?? "");
      if (match[2] !== "-") {
        return { code: Number(match[1]), text: lines.join("\n") };
      }
    }
  }

  return {
    async command(line: string): Promise<void> {
      await write(`${line}\r\n`);
    },

    async raw(text: string): Promise<void> {
      await write(text);
    },

    async read(): Promise<SmtpReply> {
      return withTimeout(readReply(), timeoutMs);
    },

    async close(): Promise<void> {
      try {
        await socket.close();
      } catch {
        // The socket is closed already; there is nothing to close.
      }
    },
  };
}

/** A mail that is ready to go on the wire. */
interface OutgoingMail {
  /** The address the mail goes out from. */
  from: string;
  /** The address the mail goes to. */
  to: string;
  /** The subject of the mail. */
  subject: string;
  /** The html of the mail, with the line ends SMTP wants. */
  html: string;
}

/**
 * The mail that goes on the wire, with the addresses checked.
 *
 * An address that is not an address is refused here, before anything is
 * sent.
 */
function outgoing(config: SmtpConfig, msg: MailMessage): OutgoingMail {
  return {
    from: addressOf(config.from),
    to: addressOf(msg.to),
    subject: msg.subject,
    html: msg.html.replace(/\r?\n/g, "\r\n"),
  };
}

/** The mail as it goes over the wire: the headers and the body. */
function message(mail: OutgoingMail, config: SmtpConfig): string {
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${config.host}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ];

  return `${headers.join("\r\n")}\r\n\r\n${mail.html}`;
}

/**
 * The address of a mail, when it is an address at all.
 *
 * An address with a line end in it would end the header and begin another
 * one, so such an address is refused before anything goes out.
 */
function addressOf(value: string): string {
  const address = value.trim();

  if (!address || /[\r\n]/.test(address)) {
    throw new Error(`the address of the mail is not an address: ${value}`);
  }

  return address;
}

/**
 * The value of a header, safe to put in one.
 *
 * A line end in the value of a header would end the header and begin
 * another one, so the line ends go away.
 */
function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Doubles the dot of the lines that begin with one.
 *
 * A line of a mail that begins with a dot would end the mail, so the dot is
 * doubled; the mail server takes the extra one away.
 */
function dotStuff(mail: string): string {
  return mail
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

/**
 * The subject of a mail, ready for a header.
 *
 * A subject with letters outside the plain ASCII is written the way the
 * mail standards want it: the base64 of the text between two marks.
 */
function encodeHeader(value: string): string {
  const safe = headerValue(value);

  if (!/[^\x20-\x7E]/.test(safe)) {
    return safe;
  }
  return `=?UTF-8?B?${base64(safe)}?=`;
}

/** The text as base64, the way the sign in of the mail server wants it. */
function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
