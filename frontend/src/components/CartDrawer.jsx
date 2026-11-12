import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, Trash2, ShoppingBag, Tag, ShieldCheck, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { inr } from "../lib/api";
import { useCart } from "../context/CartContext";
import CheckoutModal from "./CheckoutModal";

const EASE = [0.16, 1, 0.3, 1];
const FREE_SHIP_AT_PAISE = 99900; // ₹999

export default function CartDrawer() {
  const {
    items, cartOpen, setCartOpen, setQty, removeItem,
    coupon, applyCoupon, removeCoupon, subtotal, discount, gst, shipping, total, count,
  } = useCart();
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleApply = async () => {
    if (!couponInput.trim()) return;
    setCouponMsg(null);
    const res = await applyCoupon(couponInput.trim());
    if (res.ok) {
      setCouponMsg({ ok: true, text: `${res.label} applied` });
      toast.success(`Coupon ${couponInput.trim().toUpperCase()} applied — ${res.label}`);
      setCouponInput("");
    } else {
      setCouponMsg({ ok: false, text: res.error });
    }
  };

  const progress = Math.min(100, Math.round(((subtotal - discount) / FREE_SHIP_AT_PAISE) * 100));

  return (
    <>
      <AnimatePresence>
        {cartOpen && (
          <>
            {/* Both children carry explicit keys: AnimatePresence tracks its
                children by key. */}
            <motion.div
              key="cart-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setCartOpen(false)}
              className="fixed inset-0 z-[60] bg-kinetic-ink/45 backdrop-blur-sm"
              data-testid="cart-drawer-overlay"
            />
            <motion.aside
              key="cart-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.4, ease: EASE }}
              className="fixed top-0 right-0 z-[70] h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
              data-testid="cart-drawer"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <h2 className="font-display font-black text-xl text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" /> Your Cart
                  {count > 0 && (
                    <span className="text-sm font-extrabold text-kinetic-red" data-testid="cart-drawer-count">
                      ({count})
                    </span>
                  )}
                </h2>
                <button
                  data-testid="cart-close-button"
                  onClick={() => setCartOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                  aria-label="Close cart"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
                  <span className="w-20 h-20 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                    <ShoppingBag className="w-8 h-8 text-slate-300" />
                  </span>
                  <p className="font-display font-bold text-xl text-slate-900">Your cart is feeling light</p>
                  <p className="text-sm text-slate-500 -mt-2">
                    Load up on protein, pre-workout and recovery fuel.
                  </p>
                  <button
                    data-testid="cart-empty-browse-btn"
                    onClick={() => setCartOpen(false)}
                    className="mt-2 px-6 py-3 rounded-full bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors"
                  >
                    Browse Supplements
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto kinetic-scroll px-6 py-4 space-y-4" data-lenis-prevent>
                    {/* No `layout` prop on the rows: a row unmounting while
                        the drawer is open leaves framer-motion's projection
                        stuck, the drawer's own exit then never runs, and the
                        overlay stays mounted blocking the page. */}
                    {items.map((item) => (
                      <motion.div
                        key={item.key}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3.5 rounded-2xl border border-slate-100 p-3"
                        data-testid={`cart-item-${item.product.id}`}
                      >
                        <img
                          src={item.product.images?.[0] ?? item.product.image}
                          alt={item.product.name}
                          className="w-20 h-20 rounded-xl object-cover bg-slate-50 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase font-extrabold tracking-[0.18em] text-slate-400">
                            {item.product.brand}
                          </p>
                          <p className="text-sm font-bold text-slate-900 leading-snug truncate">
                            {item.product.name}
                          </p>
                          <p className="text-xs text-slate-500 font-semibold mt-0.5">
                            {[item.flavor, item.weight].filter(Boolean).join(" · ") || "Standard"}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1 rounded-full border border-slate-200 px-1 py-0.5">
                              <button
                                data-testid={`cart-item-decrease-${item.product.id}`}
                                onClick={() => setQty(item.key, item.qty - 1)}
                                className="p-1.5 rounded-full hover:bg-slate-100"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-extrabold" data-testid={`cart-item-qty-${item.product.id}`}>
                                {item.qty}
                              </span>
                              <button
                                data-testid={`cart-item-increase-${item.product.id}`}
                                onClick={() => setQty(item.key, item.qty + 1)}
                                className="p-1.5 rounded-full hover:bg-slate-100"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-display font-black text-slate-900">
                                {inr((item.product.price * item.qty) / 100)}
                              </p>
                              <button
                                data-testid={`cart-item-remove-${item.product.id}`}
                                onClick={() => removeItem(item.key)}
                                className="p-1.5 rounded-full text-slate-400 hover:text-kinetic-red hover:bg-red-50 transition-colors"
                                aria-label="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 px-6 py-4 space-y-3.5">
                    {subtotal - discount < FREE_SHIP_AT_PAISE && (
                      <div>
                        <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
                          <Truck className="w-3.5 h-3.5 text-kinetic-orange" />
                          Add {inr((FREE_SHIP_AT_PAISE - (subtotal - discount)) / 100)} more for FREE express shipping
                        </p>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-kinetic-red to-kinetic-orange"
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.4 }}
                          />
                        </div>
                      </div>
                    )}

                    {coupon ? (
                      <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5" data-testid="coupon-applied-row">
                        <span className="flex items-center gap-2 text-sm font-extrabold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" /> {coupon.code} — {coupon.label}
                        </span>
                        <button
                          data-testid="coupon-remove-button"
                          onClick={() => { removeCoupon(); setCouponMsg(null); }}
                          className="p-1 rounded-full hover:bg-emerald-100"
                          aria-label="Remove coupon"
                        >
                          <X className="w-4 h-4 text-emerald-600" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              data-testid="coupon-input"
                              value={couponInput}
                              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                              onKeyDown={(e) => e.key === "Enter" && handleApply()}
                              placeholder="Coupon code — try KINETIC10"
                              className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold tracking-wide placeholder:font-semibold placeholder:text-slate-400 focus:border-kinetic-red focus:outline-none transition-colors"
                            />
                          </div>
                          <button
                            data-testid="coupon-apply-button"
                            onClick={handleApply}
                            className="px-5 py-2.5 rounded-xl bg-kinetic-ink text-white text-sm font-extrabold hover:bg-slate-800 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                        {couponMsg && (
                          <p className={`text-xs font-bold mt-1.5 ${couponMsg.ok ? "text-emerald-600" : "text-kinetic-red"}`} data-testid="coupon-message">
                            {couponMsg.text}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 text-sm font-semibold" data-testid="cart-pricing-summary">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span>{inr(subtotal / 100)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-emerald-600 font-extrabold">
                          <span>Coupon discount</span>
                          <span>−{inr(discount / 100)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>GST (5%)</span>
                        <span>{inr(gst / 100)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Express shipping</span>
                        <span className={shipping === 0 ? "text-emerald-600 font-extrabold" : ""}>
                          {shipping === 0 ? "FREE" : inr(shipping / 100)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-dashed border-slate-200 pt-2.5 mt-1 font-display font-black text-lg text-slate-900">
                        <span>Total</span>
                        <span data-testid="cart-total-amount">{inr(total / 100)}</span>
                      </div>
                    </div>

                    <button
                      data-testid="checkout-button"
                      onClick={() => setCheckoutOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-kinetic-red text-white font-extrabold text-base hover:bg-kinetic-orange transition-colors shadow-[0_14px_30px_-12px_rgba(255,59,48,0.6)]"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      Checkout · {inr(total / 100)}
                    </button>
                  </div>
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
      />
    </>
  );
}

