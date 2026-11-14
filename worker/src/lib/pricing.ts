/**
 * The pricing of an order.
 *
 * Every amount is an integer number of paise. The rules are the ones of the
 * old `backend/server.py`, which worked in rupees:
 * - the GST is `round((subtotal - discount) * 0.05)`;
 * - the shipping is free from Rs 999 of goods left after the discount
 *   (99900 paise) and costs Rs 79 (7900 paise) below that;
 * - a percent coupon gives `round(subtotal * value / 100)`, a flat coupon
 *   gives its value, and neither of them gives more than the subtotal.
 */

/** A line of an order, priced from the database. */
export interface PricedItem {
  product_id: string;
  name: string;
  /** The sale price of the product, in paise. */
  unit_price: number;
  qty: number;
  flavor?: string | null;
  weight?: string | null;
  /** Whether this product is currently on promotional sale (ineligible for coupon discounts). */
  is_on_sale?: boolean;
}

/** A row of the `coupons` table. */
export interface CouponRow {
  code: string;
  discount_type: "percent" | "flat";
  /** The percent of the coupon, or its value in paise when it is flat. */
  discount_value: number;
  /** The smallest order the coupon works on, in paise. */
  min_order: number;
  active: number;
  /** Whether the coupon is single-use per customer (1: yes, 0: no). Default 1. */
  single_use_per_user?: number;
}

/** The prices of an order, in paise. */
export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  gst: number;
  shipping: number;
  total: number;
}

/** The GST rate of the store. */
export const GST_RATE = 0.05;

/** The value of the goods, in paise, that gets the shipping for free. */
export const FREE_SHIPPING_FROM = 99_900;

/** The shipping fee, in paise, below the free shipping limit. */
export const SHIPPING_FEE = 7_900;

/**
 * Whether a coupon can be used on an order of the given subtotal: it has to
 * be running, and the order has to reach its minimum.
 */
export function couponApplies(coupon: CouponRow | null, subtotal: number): boolean {
  if (!coupon) {
    return false;
  }

  return coupon.active === 1 && subtotal >= coupon.min_order;
}

/**
 * The discount a coupon gives on an order of the given subtotal, in paise.
 * A coupon that cannot be used gives no discount, and a discount never goes
 * above the subtotal.
 */
export function couponDiscount(coupon: CouponRow | null, subtotal: number): number {
  if (!coupon || !couponApplies(coupon, subtotal)) {
    return 0;
  }

  const discount =
    coupon.discount_type === "percent"
      ? Math.round((subtotal * coupon.discount_value) / 100)
      : coupon.discount_value;

  return Math.max(0, Math.min(discount, subtotal));
}

/**
 * The address fields required to verify regional free shipping.
 */
export interface ShippingDestination {
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
}

/**
 * Checks if a shipping address is in Jamshedpur or surrounding areas
 * (including Adityapur, Gamharia, Sakchi, Bistupur, Kadma, Sonari, Mango, Telco, Jugsalai, etc.).
 */
export function isJamshedpurOrSurrounding(dest?: ShippingDestination | null): boolean {
  if (!dest) return false;

  // 1. Coordinate check (within ~40km of Jamshedpur center ~22.805, 86.203)
  if (typeof dest.lat === "number" && typeof dest.lng === "number") {
    const dLat = dest.lat - 22.8046;
    const dLng = dest.lng - 86.2029;
    if (dLat * dLat + dLng * dLng <= 0.16) {
      return true;
    }
  }

  // 2. Pincode check: Jamshedpur urban (831xxx) and Adityapur/Gamharia corridor (8321xx / 8323xx)
  const pin = (dest.pincode || "").replace(/\D/g, "");
  if (pin.startsWith("831") || pin.startsWith("8321") || pin.startsWith("8323")) {
    return true;
  }

  // 3. Keyword check across text fields
  const text = `${dest.city || ""} ${dest.landmark || ""} ${dest.address || ""} ${dest.state || ""}`.toLowerCase();
  const keywords = [
    "jamshedpur",
    "tatanagar",
    "adityapur",
    "gamharia",
    "gamaria",
    "sakchi",
    "bistupur",
    "bishtupur",
    "kadma",
    "sonari",
    "mango",
    "telco",
    "jugsalai",
    "golmuri",
    "burmamines",
    "baridih",
    "bagbera",
    "parsudih",
    "sidhgora",
    "govindpur",
    "sundernagar",
    "agrico",
    "kandra",
    "singhbhum",
  ];
  return keywords.some((k) => text.includes(k));
}

/**
 * The prices of an order: the subtotal of its lines, the discount of the
 * coupon, the GST, the shipping and the total.
 */
export function priceOrder(
  items: PricedItem[],
  coupon: CouponRow | null,
  destination?: ShippingDestination | null
): PriceBreakdown {
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.qty, 0);
  // Sale products are not eligible for coupon discounts
  const hasSaleFlags = items.some((item) => item.is_on_sale !== undefined);
  const eligibleSubtotal = hasSaleFlags
    ? items.filter((item) => !item.is_on_sale).reduce((sum, item) => sum + item.unit_price * item.qty, 0)
    : subtotal;

  const discount = couponDiscount(coupon, eligibleSubtotal);
  const gst = Math.round((subtotal - discount) * GST_RATE);
  const isFreeArea = isJamshedpurOrSurrounding(destination);
  const shipping = isFreeArea || subtotal - discount >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  const total = subtotal - discount + gst + shipping;

  return { subtotal, discount, gst, shipping, total };
}
