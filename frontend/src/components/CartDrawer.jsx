import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  Tag,
  ShieldCheck,
  Truck,
  CheckCircle2,
  ArrowLeft,
  LocateFixed,
  Loader2,
  MapPin,
  CreditCard,
  Banknote,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { inr, API, formatApiError } from "../lib/api";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { detectCurrentLocation, isJamshedpurOrSurrounding } from "../lib/location";

const EASE = [0.16, 1, 0.3, 1];
const FREE_SHIP_AT_PAISE = 99900; // ₹999

const PAYMENT_METHODS = [
  { id: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives at your door", icon: Banknote },
  { id: "upi", label: "UPI", desc: "Instant UPI payment (Demo mode)", icon: Smartphone },
  { id: "card", label: "Credit / Debit Card", desc: "Cards accepted (Demo mode)", icon: CreditCard },
];

export default function CartDrawer() {
  const {
    items,
    cartOpen,
    setCartOpen,
    setQty,
    removeItem,
    clearCart,
    coupon,
    applyCoupon,
    removeCoupon,
    subtotal,
    discount,
    gst,
    shipping,
    total,
    count,
    hasSaleItems,
    refreshCartPrices,
    shippingLocation,
    setShippingLocation,
    isLocalJamshedpur,
  } = useCart();
  const { user } = useAuth();

  const [step, setStep] = useState("cart"); // "cart" | "address" | "payment" | "success"
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  // Address form fields including landmark and state
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
  });

  // Pre-fill contact details if user is logged in
  useEffect(() => {
    if (user && user.email) {
      setForm((prev) => ({
        ...prev,
        full_name: prev.full_name || user.name || "",
        email: prev.email || user.email || "",
        phone: prev.phone || user.phone || "",
      }));
    }
  }, [user]);

  const [errors, setErrors] = useState({});
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Payment & Order Placement state
  const [payment, setPayment] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(null);

  // When cart opens, refresh prices (stable function, runs once per open)
  useEffect(() => {
    if (cartOpen) {
      refreshCartPrices();
    }
  }, [cartOpen, refreshCartPrices]);

  // Reset step to cart when drawer fully closes if needed
  const handleClose = () => {
    setCartOpen(false);
    if (step === "success") {
      setStep("cart");
      setPlaced(null);
    }
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code || applyingCoupon) return;
    setApplyingCoupon(true);
    setCouponMsg(null);
    try {
      const customerEmail = (user && user.email) || form.email || undefined;
      const res = await applyCoupon(code, customerEmail);
      if (res.ok) {
        setCouponMsg({ ok: true, text: `${res.label} applied` });
        toast.success(`Coupon ${code.toUpperCase()} applied — ${res.label}`);
        setCouponInput("");
      } else {
        setCouponMsg({ ok: false, text: res.error });
      }
    } catch (e) {
      setCouponMsg({ ok: false, text: formatApiError(e) });
    } finally {
      setApplyingCoupon(false);
    }
  };

  const progress = Math.min(100, Math.round(((subtotal - discount) / FREE_SHIP_AT_PAISE) * 100));

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: null }));
    }
  };

  // Automatically detect location using browser geolocation & reverse geocoding
  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    try {
      const loc = await detectCurrentLocation();
      setForm((prev) => ({
        ...prev,
        address: loc.address || prev.address,
        landmark: loc.landmark || prev.landmark,
        city: loc.city || prev.city,
        state: loc.state || prev.state,
        pincode: loc.pincode || prev.pincode,
      }));
      setShippingLocation(loc);
      setErrors((prev) => ({
        ...prev,
        address: null,
        landmark: null,
        city: null,
        state: null,
        pincode: null,
      }));
      if (isJamshedpurOrSurrounding(loc)) {
        toast.success("Location detected! Free Shipping applied for Jamshedpur & surrounding areas ⚡");
      } else {
        toast.success("Location auto-detected! Address details filled.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to detect location. Please fill manually.");
    } finally {
      setDetectingLocation(false);
    }
  };

  // Sync manual address typing with shipping location calculation
  useEffect(() => {
    if (form.city || form.pincode || form.address || form.landmark) {
      setShippingLocation((prev) => ({
        ...prev,
        city: form.city,
        pincode: form.pincode,
        address: form.address,
        landmark: form.landmark,
        state: form.state,
      }));
    }
  }, [form.city, form.pincode, form.address, form.landmark, form.state, setShippingLocation]);

  const validateAddress = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = "Required";
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, "").slice(-10))) errs.phone = "Enter 10-digit number";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Enter valid email";
    if (!form.address.trim()) errs.address = "Required";
    if (!form.city.trim()) errs.city = "Required";
    if (!form.state.trim()) errs.state = "Required";
    if (!/^\d{6}$/.test(form.pincode)) errs.pincode = "6 digits";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePlaceOrder = async () => {
    setPlacing(true);
    try {
      const { data } = await API.post("/orders", {
        items: items.map((i) => ({
          product_id: i.product.id,
          qty: i.qty,
          flavor: i.flavor,
          weight: i.weight,
        })),
        coupon_code: coupon?.code || null,
        shipping: form,
        payment_method: payment,
      });
      setPlaced(data);
      setStep("success");
      clearCart();
      toast.success(`Order ${data.order_id} confirmed!`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPlacing(false);
    }
  };

  const inputCls = (key) =>
    `w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold placeholder:text-slate-400 focus:bg-white focus:outline-none transition-all ${
      errors[key]
        ? "border-kinetic-red bg-red-50/30 ring-1 ring-kinetic-red"
        : "border-slate-200 bg-[#F6F7F9] focus:ring-2 focus:ring-slate-900"
    }`;

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          {/* Overlay */}
          <motion.div
            key="cart-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
            className="fixed inset-0 z-[60] bg-kinetic-ink/45 backdrop-blur-sm"
            data-testid="cart-drawer-overlay"
          />

          {/* Cart Drawer */}
          <motion.aside
            key="cart-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.4, ease: EASE }}
            className="fixed top-0 right-0 z-[70] h-full w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
            data-testid="cart-drawer"
          >
            {/* Header: Adapts based on current step */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                {step !== "cart" && step !== "success" && (
                  <button
                    type="button"
                    data-testid="checkout-back-btn"
                    onClick={() => setStep(step === "payment" ? "address" : "cart")}
                    className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
                    aria-label="Back"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <h2 className="font-display font-black text-xl text-slate-900 flex items-center gap-2">
                  {step === "cart" && (
                    <>
                      <ShoppingBag className="w-5 h-5 text-slate-900" />
                      <span>Your Cart</span>
                      {count > 0 && (
                        <span className="text-sm font-extrabold text-kinetic-red" data-testid="cart-drawer-count">
                          ({count})
                        </span>
                      )}
                    </>
                  )}
                  {step === "address" && (
                    <>
                      <MapPin className="w-5 h-5 text-kinetic-red" />
                      <span>Delivery Address</span>
                    </>
                  )}
                  {step === "payment" && (
                    <>
                      <CreditCard className="w-5 h-5 text-slate-900" />
                      <span>Payment Method</span>
                    </>
                  )}
                  {step === "success" && (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span>Order Confirmed</span>
                    </>
                  )}
                </h2>
              </div>
              <button
                data-testid="cart-close-button"
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Close cart"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* STEP 1: CART ITEMS */}
            {step === "cart" && (
              <>
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
                      {items.map((item) => (
                        <motion.div
                          key={item.key}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex gap-3.5 rounded-2xl border border-slate-100 p-3 bg-white shadow-xs"
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

                    <div className="border-t border-slate-100 px-6 py-4 space-y-3.5 bg-white flex-shrink-0">
                      {isLocalJamshedpur ? (
                        <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-3 flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <Truck className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-emerald-900 leading-tight">
                              Free Shipping Applied! ⚡
                            </p>
                            <p className="text-[11px] font-semibold text-emerald-700">
                              Special free delivery unlocked for Jamshedpur & surrounding areas.
                            </p>
                          </div>
                        </div>
                      ) : subtotal - discount < FREE_SHIP_AT_PAISE ? (
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
                      ) : null}

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
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleApplyCoupon();
                                  }
                                }}
                                placeholder="Coupon code — try TOM10"
                                className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold tracking-wide placeholder:font-semibold placeholder:text-slate-400 focus:border-kinetic-red focus:outline-none transition-colors"
                              />
                            </div>
                            <button
                              type="button"
                              data-testid="coupon-apply-button"
                              onClick={handleApplyCoupon}
                              disabled={applyingCoupon || !couponInput.trim()}
                              className="px-5 py-2.5 rounded-xl bg-kinetic-ink text-white text-sm font-extrabold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[76px]"
                            >
                              {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                            </button>
                          </div>
                          {couponMsg && (
                            <p className={`text-xs font-bold mt-1.5 ${couponMsg.ok ? "text-emerald-600" : "text-kinetic-red"}`} data-testid="coupon-message">
                              {couponMsg.text}
                            </p>
                          )}
                          {hasSaleItems && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-lg px-2.5 py-1.5 mt-2 font-medium leading-tight">
                              * Products currently on promotional sale are already heavily discounted and not eligible for extra coupon discounts.
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
                            {shipping === 0 ? (
                              isLocalJamshedpur ? (
                                <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-600">
                                  FREE
                                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md">
                                    Jamshedpur
                                  </span>
                                </span>
                              ) : (
                                "FREE"
                              )
                            ) : (
                              inr(shipping / 100)
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 mt-1 font-display font-black text-lg text-slate-900">
                          <span>Total</span>
                          <span data-testid="cart-total-amount">{inr(total / 100)}</span>
                        </div>
                      </div>

                      {/* Transition directly into address filling inside the cart box */}
                      <button
                        data-testid="checkout-button"
                        onClick={() => setStep("address")}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors shadow-md shadow-kinetic-red/30 active:scale-95"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Checkout · {inr(total / 100)}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* STEP 2: FILL ADDRESS (INSIDE CART BOX) */}
            {step === "address" && (
              <div
                className="flex-1 flex flex-col justify-between overflow-hidden"
                data-testid="checkout-step-shipping"
              >
                <div className="flex-1 overflow-y-auto kinetic-scroll px-6 py-4 space-y-3.5" data-lenis-prevent>
                  {/* AUTO-DETECT LOCATION BUTTON: Placed above Full Name */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-kinetic-red" />
                        Quick Auto-Fill
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">GPS Geolocation</span>
                    </div>
                    <button
                      type="button"
                      data-testid="checkout-auto-locate-btn"
                      onClick={handleDetectLocation}
                      disabled={detectingLocation}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-70 active:scale-95"
                    >
                      {detectingLocation ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-kinetic-red" />
                          <span>Detecting GPS Location…</span>
                        </>
                      ) : (
                        <>
                          <LocateFixed className="w-4 h-4 text-kinetic-red" />
                          <span>Detect My Location &amp; Auto-Fill</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 1. Full Name */}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Full Name *
                    </label>
                    <input
                      data-testid="checkout-input-full_name"
                      value={form.full_name}
                      onChange={setField("full_name")}
                      placeholder="e.g. Arjun Sharma"
                      className={inputCls("full_name")}
                    />
                    {errors.full_name && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.full_name}</p>}
                  </div>

                  {/* 2. Phone & Email in 2 columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        Phone *
                      </label>
                      <input
                        data-testid="checkout-input-phone"
                        value={form.phone}
                        onChange={setField("phone")}
                        placeholder="10-digit mobile"
                        className={inputCls("phone")}
                      />
                      {errors.phone && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        Email Address *
                      </label>
                      <input
                        data-testid="checkout-input-email"
                        value={form.email}
                        onChange={setField("email")}
                        placeholder="you@example.com"
                        className={inputCls("email")}
                      />
                      {errors.email && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  {/* 3. Street Address */}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Flat / House No. / Street Address *
                    </label>
                    <input
                      data-testid="checkout-input-address"
                      value={form.address}
                      onChange={setField("address")}
                      placeholder="Flat 402, Iron Heights, Linking Road"
                      className={inputCls("address")}
                    />
                    {errors.address && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.address}</p>}
                  </div>

                  {/* 4. Landmark (Requested field) */}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Landmark
                    </label>
                    <input
                      data-testid="checkout-input-landmark"
                      value={form.landmark}
                      onChange={setField("landmark")}
                      placeholder="e.g. Near Gold's Gym, Opp. Central Mall"
                      className={inputCls("landmark")}
                    />
                  </div>

                  {/* 5. City & State (Requested field) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        City *
                      </label>
                      <input
                        data-testid="checkout-input-city"
                        value={form.city}
                        onChange={setField("city")}
                        placeholder="e.g. Mumbai"
                        className={inputCls("city")}
                      />
                      {errors.city && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.city}</p>}
                    </div>

                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        State *
                      </label>
                      <input
                        data-testid="checkout-input-state"
                        value={form.state}
                        onChange={setField("state")}
                        placeholder="e.g. Maharashtra"
                        className={inputCls("state")}
                      />
                      {errors.state && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.state}</p>}
                    </div>
                  </div>

                  {/* 6. PIN Code */}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      PIN Code *
                    </label>
                    <input
                      data-testid="checkout-input-pincode"
                      value={form.pincode}
                      onChange={setField("pincode")}
                      placeholder="6-digit PIN code"
                      className={inputCls("pincode")}
                    />
                    {errors.pincode && <p className="text-[11px] font-bold text-kinetic-red mt-1">{errors.pincode}</p>}
                  </div>
                </div>

                {/* Footer for Address Step */}
                <div className="border-t border-slate-100 px-6 py-4 bg-white flex-shrink-0 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Order Total:</span>
                    <span className="font-display font-black text-sm text-slate-900">{inr(total / 100)}</span>
                  </div>
                  <button
                    data-testid="checkout-continue-btn"
                    onClick={() => {
                      if (validateAddress()) {
                        setStep("payment");
                      }
                    }}
                    className="w-full py-3.5 rounded-2xl bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors shadow-md shadow-kinetic-red/30 active:scale-95"
                  >
                    Continue to Payment
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: PAYMENT METHOD */}
            {step === "payment" && (
              <div
                className="flex-1 flex flex-col justify-between overflow-hidden"
                data-testid="checkout-step-payment"
              >
                <div className="flex-1 overflow-y-auto kinetic-scroll px-6 py-4 space-y-4" data-lenis-prevent>
                  {/* Delivery address mini summary */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        Deliver to:
                      </span>
                      <button
                        type="button"
                        onClick={() => setStep("address")}
                        className="text-[10px] font-bold text-kinetic-red hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="font-bold text-slate-900">{form.full_name} • {form.phone}</p>
                    <p className="text-slate-600 font-medium truncate mt-0.5">
                      {[form.address, form.landmark, form.city, form.state, form.pincode].filter(Boolean).join(", ")}
                    </p>
                  </div>

                  {/* Payment Choices */}
                  <div className="space-y-2.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                      Select Payment Mode
                    </p>
                    {PAYMENT_METHODS.map(({ id, label, desc, icon: Icon }) => {
                      const isSelected = payment === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          data-testid={`payment-option-${id}`}
                          onClick={() => setPayment(id)}
                          className={`w-full flex items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all ${
                            isSelected
                              ? "border-slate-900 bg-slate-50/80 shadow-xs"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <span
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-extrabold text-xs text-slate-900">{label}</span>
                            <span className="block text-[11px] text-slate-500 font-medium truncate">{desc}</span>
                          </span>
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? "border-slate-900 bg-slate-900" : "border-slate-300"
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-slate-400 font-medium">
                    * Demo mode active. Cash on Delivery is enabled; online UPI and Cards are simulated instantly.
                  </p>
                </div>

                {/* Footer for Payment Step */}
                <div className="border-t border-slate-100 px-6 py-4 bg-white flex-shrink-0 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Final Amount:</span>
                    <span className="font-display font-black text-base text-slate-900">{inr(total / 100)}</span>
                  </div>
                  <button
                    data-testid="place-order-button"
                    onClick={handlePlaceOrder}
                    disabled={placing}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors shadow-md shadow-kinetic-red/30 active:scale-95 disabled:opacity-60"
                  >
                    {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {placing ? "Placing Order…" : `Place Order · ${inr(total / 100)}`}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: ORDER CONFIRMED SCREEN */}
            {step === "success" && placed && (
              <div
                className="flex-1 flex flex-col justify-between overflow-y-auto kinetic-scroll px-6 py-6"
                data-testid="order-success-screen"
                data-lenis-prevent
              >
                <div className="flex flex-col items-center text-center gap-3 my-auto">
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </motion.span>
                  <p className="font-display font-black text-2xl text-slate-900">You're locked in!</p>
                  <p className="text-xs text-slate-500 font-semibold max-w-xs">
                    Order{" "}
                    <span className="font-extrabold text-slate-900" data-testid="order-success-id">
                      {placed.order_id}
                    </span>{" "}
                    is confirmed.
                    {placed.payment_method === "cod"
                      ? ` Keep ${inr(placed.total / 100)} ready at your door.`
                      : " Paid successfully."}
                  </p>

                  <div
                    className="w-full rounded-2xl bg-[#F6F7F9] border border-slate-200/80 p-4 text-xs font-semibold text-slate-600 space-y-1.5 mt-2"
                    data-testid="order-success-summary"
                  >
                    <div className="flex justify-between">
                      <span>Items</span>
                      <span className="font-bold text-slate-900">
                        {placed.items?.reduce((s, i) => s + i.qty, 0) || count}
                      </span>
                    </div>
                    {placed.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-extrabold">
                        <span>{placed.coupon_code} discount</span>
                        <span>−{inr(placed.discount / 100)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-display font-black text-sm text-slate-900 pt-1 border-t border-slate-200">
                      <span>Total Paid</span>
                      <span>{inr(placed.total / 100)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex-shrink-0">
                  <button
                    data-testid="order-success-continue-btn"
                    onClick={() => {
                      setStep("cart");
                      setPlaced(null);
                      setCartOpen(false);
                    }}
                    className="w-full py-3.5 rounded-2xl bg-kinetic-red text-white font-extrabold text-sm hover:bg-kinetic-orange transition-colors"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
