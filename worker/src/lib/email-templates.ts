/**
 * The templates of the order mails.
 *
 * The markup is plain and inline styled, so it reads the same in every mail
 * client. Every mail goes to the address of the buyer of the order, the one
 * that was given at the checkout, so a guest that never signed in is told
 * about the order as well.
 */

/** An order as the templates need it. */
export interface OrderForEmail {
  order_number: string;
  name: string;
  email: string;
  /** The amount of the order, in paise. */
  subtotal: number;
  discount: number;
  gst: number;
  shipping: number;
  total: number;
  /** The day the order is expected to be delivered, when it is known. */
  estimated_delivery_date?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
}

/** A line of an order as the templates need it. */
export interface ItemForEmail {
  name: string;
  qty: number;
  /** The price of one unit, in paise. */
  unit_price: number;
}

/** A mail message: the recipient, the subject and the html body. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/** The brand red of the store. */
const BRAND_RED = "#FF3B30";

/** The name of the store, as the buyer knows it. */
const BRAND_NAME = "Kinetic Nutrition";

/** What every mail of a status says. */
const STATUS_LINES = new Map<string, string>([
  ["placed", "Your order is placed and we are getting it ready."],
  ["confirmed", "We have confirmed your order and it is being packed."],
  ["shipped", "Your order is on its way."],
  ["delivered", "Your order has been delivered."],
  ["cancelled", "Your order has been cancelled."],
]);

/** Paise as the rupees the buyer reads. */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** Escapes the text that goes into the html of a mail. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The frame of every mail: the band of the brand and the body. */
function layout(body: string): string {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#090D16">` +
    `<div style="background:${BRAND_RED};color:#fff;padding:16px;font-weight:bold">` +
    `${BRAND_NAME.toUpperCase()}</div>` +
    `<div style="padding:16px">${body}</div></div>`
  );
}

/** The table of the totals of an order. */
function totalsTable(order: OrderForEmail): string {
  const totals = [
    ["Subtotal", rupees(order.subtotal)],
    ["Discount", `-${rupees(order.discount)}`],
    ["GST", rupees(order.gst)],
    ["Shipping", rupees(order.shipping)],
    ["Total", rupees(order.total)],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0">${label}</td>` +
        `<td style="padding:6px 0;text-align:right">${value}</td></tr>`,
    )
    .join("");

  return `<table style="width:100%;border-collapse:collapse;border-top:1px solid #E5E7EB">${totals}</table>`;
}

/** The line of the day the order is expected to be delivered. */
function deliveryLine(delivery: string | null): string {
  return delivery ? `<p>Estimated delivery: ${escapeHtml(delivery)}</p>` : "";
}

/** The mail that tells the buyer that the order is placed. */
export function orderPlacedEmail(order: OrderForEmail, items: ItemForEmail[]): MailMessage {
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0">${escapeHtml(item.name)} x ${item.qty}</td>` +
        `<td style="padding:6px 0;text-align:right">Rs ${rupees(item.unit_price * item.qty)}</td></tr>`,
    )
    .join("");

  const body =
    `<p>Hi ${escapeHtml(order.name)},</p>` +
    `<p>Your order <strong>${escapeHtml(order.order_number)}</strong> is placed. ` +
    `We will let you know when it is on the way.</p>` +
    deliveryLine(order.estimated_delivery_date ?? null) +
    `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
    totalsTable(order);

  return {
    to: order.email,
    subject: `Order ${order.order_number} placed - ${BRAND_NAME}`,
    html: layout(body),
  };
}

/** The courier tracking block, when the order has courier or tracking info. */
function trackingLine(order: OrderForEmail): string {
  if (!order.courier_name && !order.tracking_number && !order.tracking_url) {
    return "";
  }
  const parts: string[] = [];
  if (order.courier_name) {
    parts.push(`Courier: <strong>${escapeHtml(order.courier_name)}</strong>`);
  }
  if (order.tracking_number) {
    parts.push(`Tracking ID: <strong>${escapeHtml(order.tracking_number)}</strong>`);
  }
  if (order.tracking_url && /^https?:\/\//i.test(order.tracking_url)) {
    parts.push(`<a href="${escapeHtml(order.tracking_url)}" style="color: #ff3344; font-weight: bold; text-decoration: underline;">Track Shipment &rarr;</a>`);
  }
  return `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin: 12px 0;"><p style="margin: 0; font-size: 13px;">${parts.join(" &bull; ")}</p></div>`;
}

/**
 * The mail that tells the buyer that the status of the order has changed.
 *
 * The mail of a shipped order shows the day the order is expected to arrive,
 * when there is one; the day comes from the caller, or from the order
 * itself when the caller does not have it.
 */
export function orderStatusEmail(
  order: OrderForEmail,
  status: string,
  eta?: string,
): MailMessage {
  const delivery = eta ?? order.estimated_delivery_date ?? null;
  const line = STATUS_LINES.get(status) ?? `The status of your order is now ${status}.`;

  const body =
    `<p>Hi ${escapeHtml(order.name)},</p>` +
    `<p>${escapeHtml(line)}</p>` +
    `<p>Order <strong>${escapeHtml(order.order_number)}</strong></p>` +
    deliveryLine(delivery) +
    trackingLine(order) +
    totalsTable(order);

  return {
    to: order.email,
    subject: `Order ${order.order_number} ${status} - ${BRAND_NAME}`,
    html: layout(body),
  };
}
