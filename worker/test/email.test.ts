/**
 * The mail transport: the SMTP conversation, the log of the mails and the
 * templates of the order mails.
 *
 * The mail server is a fake one: the socket of the transport is a fake that
 * speaks SMTP, so the whole conversation is checked without a server
 * anywhere near. The fake answers the commands the way a mail server does,
 * and it can be told to refuse one of them or to keep quiet.
 */

import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { sendMail, smtpTransport, useSocketFactory } from "../src/lib/email";
import type { MailMessage } from "../src/lib/email-templates";
import { orderPlacedEmail, orderStatusEmail } from "../src/lib/email-templates";
import app from "../src/index";

const db = env.DB;

/** The state of the fake mail server. */
const server = vi.hoisted(() => ({
  /** The commands the client wrote, without their line ends. */
  commands: [] as string[],
  /** The mails that were sent, the headers and the body together. */
  messages: [] as string[],
  /** The lines of the mail that is being written. */
  lines: [] as string[],
  /** The mail server is inside a mail right now. */
  inData: false,
  /** The sockets that were opened. */
  connections: 0,
  /** The address the last socket was opened to. */
  address: undefined as SocketAddress | string | undefined,
  /** The command that has to fail, and the answer it gets. */
  reject: null as { command: string; reply: string } | null,
  /** The mail server keeps quiet when this is on. */
  silent: false,
  /** What the mail server says it can do. */
  capabilities: "250-smtp.example.com greets you\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS",
}));

/** The order of the fixture, for the mails that belong to an order. */
const ORDER_ID = "ord_email_fixture";

/** The product of the fixture, for the order the route places. */
const PROD_EMAIL = "prod_email_whey";

/** The shipping details of the fixture. */
const SHIPPING = {
  full_name: "Arjun Sharma",
  phone: "9876543210",
  email: "arjun@example.com",
  address: "Flat 4, Iron Heights Gym Road",
  city: "Mumbai",
  pincode: "400001",
};

/** A row of the log of the mails. */
interface MailRow {
  order_id: string | null;
  to_email: string;
  template: string;
  status: string;
  error: string | null;
}

/**
 * The environment of the test, with the mail server set up.
 *
 * The settings of the mail server are secrets of the owner, so they are not
 * in the environment of the tests; the ones that are here are the ones of
 * the fake server.
 */
function envWithSmtp(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "kinetic",
    SMTP_PASS: "s3cret",
    SMTP_FROM: "shop@kineticnutrition.com",
    ...overrides,
  } as unknown as Env;
}

/** A mail to send. */
function message(): MailMessage {
  return {
    to: "buyer@example.com",
    subject: "Order KN-4242 placed - Kinetic Nutrition",
    html: "<p>Hello buyer</p>",
  };
}

/** The last mail of the log that belongs to an order. */
async function readMail(orderId: string): Promise<MailRow | null> {
  return db
    .prepare(
      `SELECT order_id, to_email, template, status, error
       FROM email_log WHERE order_id = ? ORDER BY rowid DESC LIMIT 1`,
    )
    .bind(orderId)
    .first<MailRow>();
}

/**
 * The answer of the fake mail server to a line the client wrote.
 *
 * The lines of a mail are not commands: they are the mail itself, and the
 * mail ends with a line that holds a single dot.
 */
function handleLine(line: string, reply: (text: string) => void): void {
  if (server.inData) {
    if (line === ".") {
      server.inData = false;
      server.messages.push(server.lines.join("\r\n"));
      server.lines = [];
      reply("250 2.0.0 Ok: queued as 4242");
      return;
    }

    // The client doubles the dot of a line that begins with one.
    server.lines.push(line.startsWith("..") ? line.slice(1) : line);
    return;
  }

  server.commands.push(line);
  const command = line.toUpperCase();

  if (server.silent) {
    return;
  }

  if (server.reject && command.startsWith(server.reject.command)) {
    reply(server.reject.reply);
    return;
  }

  if (command.startsWith("EHLO") || command.startsWith("HELO")) {
    reply(server.capabilities);
  } else if (command.startsWith("AUTH PLAIN")) {
    reply("235 2.7.0 Authentication successful");
  } else if (command.startsWith("MAIL FROM")) {
    reply("250 2.1.0 Ok");
  } else if (command.startsWith("RCPT TO")) {
    reply("250 2.1.5 Ok");
  } else if (command === "DATA") {
    server.inData = true;
    reply("354 End data with <CR><LF>.<CR><LF>");
  } else if (command === "STARTTLS") {
    reply("220 2.0.0 Ready to start TLS");
  } else if (command === "QUIT") {
    reply("221 2.0.0 Bye");
  } else {
    reply("500 5.5.1 Command not recognized");
  }
}

/** A socket of the fake mail server. */
function fakeSocket(greeting: string | null): Socket {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let buffer = "";

  const reply = (text: string): void => {
    controller?.enqueue(encoder.encode(`${text}\r\n`));
  };

  const socket = {
    readable: new ReadableStream<Uint8Array>({
      start(stream) {
        controller = stream;
        if (greeting !== null) {
          stream.enqueue(encoder.encode(`${greeting}\r\n`));
        }
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        buffer += decoder.decode(chunk);
        let end = buffer.indexOf("\r\n");
        while (end !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          handleLine(line, reply);
          end = buffer.indexOf("\r\n");
        }
      },
    }),
    close: async () => {},
    startTls: () => fakeSocket(null),
    opened: Promise.resolve({}),
    closed: Promise.resolve(),
  };

  return socket as unknown as Socket;
}

/** The `connect` of the fake mail server. */
function fakeConnect(address: SocketAddress | string, _options?: SocketOptions): Socket {
  server.connections += 1;
  server.address = address;
  return fakeSocket(server.silent ? null : "220 smtp.example.com ESMTP ready");
}

/** Puts the real socket of the runtime back in the place of the fake one. */
let restoreSockets = (): void => {};

beforeAll(async () => {
  const created = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO orders (id, order_number, name, email, phone, address, subtotal,
          discount, gst, shipping, total, status, created_at, updated_at)
       VALUES (?, 'KN-9001', 'Arjun Sharma', 'arjun@example.com', '9876543210', '{}',
          599800, 59980, 26991, 0, 566811, 'placed', ?, ?)`,
    )
    .bind(ORDER_ID, created, created)
    .run();

  await db
    .prepare(
      `INSERT INTO products (id, name, slug, brand, mrp, sale_price, stock,
          images, flavors, weight_options, is_active, rating, orders_count, created_at)
       VALUES (?, 'Kinetic Gold Whey', 'kinetic-gold-whey-email', 'Kinetic',
          399900, 299900, 50, '[]', '[]', '[]', 1, 4.5, 0, ?)`,
    )
    .bind(PROD_EMAIL, created)
    .run();
});

beforeEach(() => {
  server.commands = [];
  server.messages = [];
  server.lines = [];
  server.inData = false;
  server.connections = 0;
  server.reject = null;
  server.silent = false;
  server.capabilities = "250-smtp.example.com greets you\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS";

  // The fake mail server takes the place of the real one.
  restoreSockets = useSocketFactory(fakeConnect);
});

afterEach(() => {
  // The real socket of the runtime takes the place of the fake one again.
  restoreSockets();
});

describe("the mail transport", () => {
  it("sends the mail over SMTP and logs it as sent", async () => {
    const result = await sendMail(envWithSmtp(), message(), {
      orderId: ORDER_ID,
      template: "placed",
    });

    expect(result).toBe("sent");
    expect(server.commands).toEqual([
      "EHLO kineticnutrition.com",
      `AUTH PLAIN ${btoa("kinetic:s3cret")}`,
      "MAIL FROM:<shop@kineticnutrition.com>",
      "RCPT TO:<buyer@example.com>",
      "DATA",
      "QUIT",
    ]);
    expect(server.address).toEqual({ hostname: "smtp.example.com", port: 465 });

    const row = await readMail(ORDER_ID);
    expect(row?.order_id).toBe(ORDER_ID);
    expect(row?.to_email).toBe("buyer@example.com");
    expect(row?.template).toBe("placed");
    expect(row?.status).toBe("sent");
    expect(row?.error).toBeNull();
  });

  it("puts the subject and the body of the mail on the wire", async () => {
    await sendMail(envWithSmtp(), message(), { orderId: ORDER_ID, template: "placed" });

    expect(server.messages).toHaveLength(1);
    const mail = server.messages[0] ?? "";
    expect(mail).toContain("Subject: Order KN-4242 placed - Kinetic Nutrition");
    expect(mail).toContain("To: buyer@example.com");
    expect(mail).toContain("From: shop@kineticnutrition.com");
    expect(mail).toContain("<p>Hello buyer</p>");
  });

  it("upgrades the connection with STARTTLS when the port is not the secure one", async () => {
    const result = await sendMail(envWithSmtp({ SMTP_PORT: "587" }), message(), {
      orderId: ORDER_ID,
    });

    expect(result).toBe("sent");
    expect(server.commands).toContain("STARTTLS");
    // The server is greeted again after the upgrade.
    expect(server.commands.filter((command) => command.startsWith("EHLO"))).toHaveLength(2);
  });

  it("fails the mail when the mail server does not offer STARTTLS", async () => {
    server.capabilities = "250-smtp.example.com greets you\r\n250 AUTH PLAIN LOGIN";

    const result = await sendMail(envWithSmtp({ SMTP_PORT: "587" }), message(), {
      orderId: ORDER_ID,
    });

    expect(result).toBe("failed");
    const row = await readMail(ORDER_ID);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("STARTTLS");
  });

  it("fails the mail when the mail server refuses the receiver", async () => {
    server.reject = { command: "RCPT TO", reply: "550 5.1.1 No such user" };

    const result = await sendMail(envWithSmtp(), message(), { orderId: ORDER_ID });

    expect(result).toBe("failed");
    const row = await readMail(ORDER_ID);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("550");
  });

  it("refuses an address with a line end in it", async () => {
    const result = await sendMail(
      envWithSmtp(),
      { ...message(), to: "buyer@example.com\r\nBcc: someone@example.com" },
      { orderId: ORDER_ID },
    );

    expect(result).toBe("failed");
    expect(server.messages).toHaveLength(0);

    const row = await readMail(ORDER_ID);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("not an address");
  });

  it("skips the mail when the mail server is not set up", async () => {
    const result = await sendMail(envWithSmtp({ SMTP_HOST: undefined }), message(), {
      orderId: ORDER_ID,
    });

    expect(result).toBe("skipped");
    expect(server.connections).toBe(0);

    const row = await readMail(ORDER_ID);
    expect(row?.status).toBe("skipped");
    expect(row?.error).toBeNull();
  });

  it("gives up on a mail server that keeps quiet", async () => {
    server.silent = true;

    const result = await sendMail(
      envWithSmtp(),
      message(),
      { orderId: ORDER_ID },
      (config, msg) => smtpTransport(config, msg, { timeoutMs: 50 }),
    );

    expect(result).toBe("failed");
    const row = await readMail(ORDER_ID);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("did not answer");
  });

  it("never throws when the transport fails", async () => {
    const result = await sendMail(
      envWithSmtp(),
      message(),
      { orderId: ORDER_ID, template: "placed" },
      async () => {
        throw new Error("the socket is gone");
      },
    );

    expect(result).toBe("failed");
    const row = await readMail(ORDER_ID);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("the socket is gone");
  });
});

describe("the mail of an order", () => {
  it("sends the mail of the order to the address of the buyer", async () => {
    const res = await app.request(
      "/api/orders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ product_id: PROD_EMAIL, qty: 1, flavor: null, weight: null }],
          shipping: SHIPPING,
          payment_method: "cod",
        }),
      },
      envWithSmtp(),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { order_id: string; order_number: string };

    const row = await readMail(body.order_id);
    expect(row?.status).toBe("sent");
    expect(row?.to_email).toBe(SHIPPING.email);
    expect(row?.template).toBe("placed");
    expect(server.commands).toContain(`RCPT TO:<${SHIPPING.email}>`);
  });
});

describe("the templates of the order mails", () => {
  /** The order of the templates. */
  const order = {
    order_number: "KN-4242",
    name: "Arjun Sharma",
    email: "arjun@example.com",
    subtotal: 599_800,
    discount: 59_980,
    gst: 26_991,
    shipping: 0,
    total: 566_811,
  };

  it("puts the number of the order in the subject of the placement mail", () => {
    const mail = orderPlacedEmail(order, [
      { name: "Kinetic Gold Whey", qty: 1, unit_price: 299_900 },
    ]);

    expect(mail.subject).toContain("KN-4242");
    expect(mail.to).toBe("arjun@example.com");
    expect(mail.html).toContain("Kinetic Gold Whey");
  });

  it("puts the number of the order in the subject of a status mail", () => {
    const mail = orderStatusEmail(order, "shipped", "2026-11-20");

    expect(mail.subject).toContain("KN-4242");
    expect(mail.to).toBe("arjun@example.com");
  });

  it("shows the day of the delivery in the mail of a shipped order", () => {
    const mail = orderStatusEmail(order, "shipped", "2026-11-20");

    expect(mail.html).toContain("Estimated delivery: 2026-11-20");
  });

  it("shows the totals and the brand of the store in a status mail", () => {
    const mail = orderStatusEmail(order, "confirmed");

    expect(mail.html).toContain("#FF3B30");
    expect(mail.html).toContain("KN-4242");
    expect(mail.html).toContain("5668.11");
  });

  it("escapes the text that comes from the order", () => {
    const mail = orderStatusEmail({ ...order, name: "<script>alert(1)</script>" }, "confirmed");

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("shows the day of the delivery in the placement mail when it is known", () => {
    const mail = orderPlacedEmail({ ...order, estimated_delivery_date: "2026-11-20" }, []);

    expect(mail.html).toContain("Estimated delivery: 2026-11-20");
  });
});
