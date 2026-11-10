import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, MapPin, CreditCard, Banknote, Smartphone, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { API, formatApiError, inr } from "../lib/api";
import { useCart } from "../context/CartContext";

const EASE = [0.16, 1, 0.3, 1];
const PAYMENT_METHODS = [
  { id: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives", icon: Banknote },
  { id: "upi", label: "UPI", desc: "Goes live at launch — demo now", icon: Smartphone },
  { id: "card", label: "Card", desc: "Goes live at launch — demo now", icon: CreditCard },
];

export default function CheckoutModal({ open, onClose }) {
  const { items, coupon, subtotal, discount, gst, shipping, total, clearCart, setCartOpen } = useCart();
  const [step, setStep] = useState(1);
  const [payment, setPayment] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", address: "", city: "", pincode: "" });
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = "Required";
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, "").slice(-10))) errs.phone = "Enter a 10-digit number";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Enter a valid email";
    if (!form.address.trim()) errs.address = "Required";
    if (!form.city.trim()) errs.city = "Required";
    if (!/^\d{6}$/.test(form.pincode)) errs.pincode = "6 digits";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const { data } = await API.post("/orders", {
        items: items.map((i) => ({ product_id: i.product.id, qty: i.qty, flavor: i.flavor, weight: i.weight })),
        coupon_code: coupon?.code || null,
        shipping: form,
        payment_method: payment,
      });
      setPlaced(data);
      setStep(3);
      clearCart();
      toast.success(`Order ${data.order_id} confirmed`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPlacing(false);
    }
  };

  const close = () => {
    onClose();
    setTimeout(() => { setStep(1); setPlaced(null); }, 300);
  };

  const inputCls = (key) =>
    `w-full px-4 py-3 rounded-xl border-2 text-sm font-bold placeholder:font-semibold placeholder:text-slate-400 focus:outline-none transition-colors ${
      errors[key] ? "border-kinetic-red" : "border-slate-200 focus:border-kinetic-red"
    }`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-kinetic-ink/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          data-testid="checkout-modal"
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="font-display font-black text-xl text-slate-900">
                {step === 3 ? "Order Confirmed" : "Checkout"}
              </h2>
              <button
                data-testid="checkout-close-button"
                onClick={close}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Close checkout"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto kinetic-scroll px-6 py-5" data-lenis-prevent>
              {step === 1 && (
                <div className="space-y-3.5" data-testid="checkout-step-shipping">
                  <p className="text-sm font-bold text-slate-600 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-kinetic-red" /> Where should the gains land?
                  </p>
                  {[
                    { key: "full_name", label: "Full name", ph: "Arjun Sharma" },
                    { key: "phone", label: "Phone", ph: "9876543210" },
                    { key: "email", label: "Email", ph: "you@example.com" },
                    { key: "address", label: "Address", ph: "Flat 4, Iron Heights Gym Road" },
                    { key: "city", label: "City", ph: "Mumbai" },
                    { key: "pincode", label: "PIN code", ph: "400001" },
                  ].map(({ key, label, ph }) => (
                    <div key={key}>
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{label}</label>
                      <input
                        data-testid={`checkout-input-${key}`}
                        value={form[key]}
                        onChange={set(key)}
                        placeholder={ph}
                        className={`mt-1 ${inputCls(key)}`}
                      />
                      {errors[key] && <p className="text-xs font-bold text-kinetic-red mt-1">{errors[key]}</p>}
                    </div>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3" data-testid="checkout-step-payment">
                  {PAYMENT_METHODS.map(({ id, label, desc, icon: Icon }) => (
                    <button
                      key={id}
                      data-testid={`payment-option-${id}`}
                      onClick={() => setPayment(id)}
                      className={`w-full flex items-center gap-3.5 rounded-2xl border-2 p-4 text-left transition-colors ${
                        payment === id ? "border-kinetic-red bg-red-50/60" : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${payment === id ? "bg-kinetic-red text-white" : "bg-slate-100 text-slate-600"}`}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="flex-1">
                        <span className="block font-extrabold text-sm text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-500 font-semibold">{desc}</span>
                      </span>
                      <span className={`w-5 h-5 rounded-full border-2 ${payment === id ? "border-kinetic-red bg-kinetic-red" : "border-slate-300"}`}>
                        {payment === id && <CheckCircle2 className="w-5 h-5 text-white" />}
                      </span>
                    </button>
                  ))}
                  <p className="text-xs text-slate-400 font-semibold pt-1">
                    Demo checkout — no payment is processed. Online payments go live at launch.
                  </p>
                </div>
              )}

              {step === 3 && placed && (
                <div className="py-6 flex flex-col items-center text-center gap-3" data-testid="order-success-screen">
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  </motion.span>
                  <p className="font-display font-black text-2xl text-slate-900">You're locked in.</p>
                  <p className="text-sm text-slate-500 font-semibold max-w-xs">
                    Order <span className="font-extrabold text-slate-900" data-testid="order-success-id">{placed.order_id}</span> is confirmed.
                    {placed.payment_method === "cod"
                      ? ` Keep ${inr(placed.total)} ready at your door.`
                      : " You'll pay online when payments go live."}
                  </p>
                  <div className="w-full rounded-2xl bg-slate-50 border border-slate-100 p-4 mt-2 text-sm font-semibold text-slate-600 space-y-1" data-testid="order-success-summary">
                    <div className="flex justify-between"><span>Items</span><span>{placed.items.reduce((s, i) => s + i.qty, 0)}</span></div>
                    {placed.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-extrabold">
                        <span>{placed.coupon_code} discount</span><span>−{inr(placed.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-display font-black text-base text-slate-900 pt-1">
                      <span>Total</span><span>{inr(placed.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100">
              {step === 1 && (
                <button
                  data-testid="checkout-continue-btn"
                  onClick={() => validate() && setStep(2)}
                  className="w-full py-4 rounded-2xl bg-kinetic-red text-white font-extrabold hover:bg-kinetic-orange transition-colors"
                >
                  Continue to Payment
                </button>
              )}
              {step === 2 && (
                <div className="flex gap-3">
                  <button
                    data-testid="checkout-back-btn"
                    onClick={() => setStep(1)}
                    className="px-5 py-4 rounded-2xl border-2 border-slate-200 font-extrabold text-slate-700 hover:border-slate-900 transition-colors flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    data-testid="place-order-button"
                    onClick={placeOrder}
                    disabled={placing}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-kinetic-ink text-white font-extrabold hover:bg-slate-800 transition-colors disabled:opacity-60"
                  >
                    {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {placing ? "Placing order…" : `Place Order · ${inr(total)}`}
                  </button>
                </div>
              )}
              {step === 3 && (
                <button
                  data-testid="order-success-continue-btn"
                  onClick={() => { close(); setCartOpen(false); }}
                  className="w-full py-4 rounded-2xl bg-kinetic-red text-white font-extrabold hover:bg-kinetic-orange transition-colors"
                >
                  Continue Shopping
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

