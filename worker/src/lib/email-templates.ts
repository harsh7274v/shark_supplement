/**
 * The templates of the order mails.
 *
 * The markup is plain and inline styled, so it reads the same in every mail
 * client. The shapes of the messages stay the same when the SMTP transport
 * of Task 8 lands, so the call sites do not change.
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

/** The mail that tells the buyer that the order is placed. */
export function orderPlacedEmail(order: OrderForEmail, items: ItemForEmail[]): MailMessage {
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0">${escapeHtml(item.name)} x ${item.qty}</td>` +
        `<td style="padding:6px 0;text-align:right">Rs ${rupees(item.unit_price * item.qty)}</td></tr>`,
    )
    .join("");

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

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#090D16">` +
    `<div style="background:${BRAND_RED};color:#fff;padding:16px;font-weight:bold">` +
    `KINETIC NUTRITION</div>` +
    `<div style="padding:16px">` +
    `<p>Hi ${escapeHtml(order.name)},</p>` +
    `<p>Your order <strong>${escapeHtml(order.order_number)}</strong> is placed. ` +
    `We will let you know when it is on the way.</p>` +
    `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
    `<table style="width:100%;border-collapse:collapse;border-top:1px solid #E5E7EB">${totals}</table>` +
    `</div></div>`;

  return {
    to: order.email,
    subject: `Order ${order.order_number} placed - Kinetic Nutrition`,
    html,
  };
}
