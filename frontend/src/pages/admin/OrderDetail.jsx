import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Mail,
  Phone,
  CreditCard,
  Banknote,
  Save,
  RefreshCw,
  Clock,
} from "lucide-react";
import { API, inr, formatApiError } from "../../lib/api";
import { toast } from "sonner";

const STATUS_COLORS = {
  placed: "bg-kinetic-red/10 text-kinetic-red border-kinetic-red/20",
  confirmed: "bg-blue-50 text-blue-800 border-blue-100",
  shipped: "bg-violet-50 text-violet-800 border-violet-100",
  delivered: "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20",
  cancelled: "bg-red-50 text-red-800 border-red-100",
};

/** Default delivery estimate: +5 days from now. Hoisted off the render path. */
const defaultEta = new Date(Date.now() + 5 * 86_400_000)
  .toISOString()
  .slice(0, 10);

/** Parses a stored date string (allows a space separator) into a Date. */
const parseDate = (value) => new Date(String(value).replace(" ", "T"));

export default function OrderDetail({ orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [etaValue, setEtaValue] = useState("");
  const [addressForm, setAddressForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    pincode: "",
  });

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/admin/orders/${orderId}`);
      setOrder(data);
      if (data.address) {
        setAddressForm({
          full_name: data.address.full_name ?? "",
          phone: data.address.phone ?? "",
          email: data.address.email ?? "",
          address: data.address.address ?? "",
          city: data.address.city ?? "",
          pincode: data.address.pincode ?? "",
        });
      }
      setEtaValue(data.estimated_delivery_date || defaultEta);
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const statusOf = () => (order ? order.status : null);
  const canEditAddress = statusOf() === "placed";
  const canConfirm = statusOf() === "placed";
  const canShip = statusOf() === "confirmed";
  const canDeliver = statusOf() === "shipped";
  const canCancel = statusOf() === "placed" || statusOf() === "confirmed";

  const patch = useCallback(
    async (body) => {
      setSaving(true);
      try {
        await API.patch(`/admin/orders/${orderId}`, body);
        toast.success("Order updated");
        await fetchOrder();
      } catch (error) {
        toast.error(formatApiError(error) || "Failed to update order");
      } finally {
        setSaving(false);
      }
    },
    [orderId, fetchOrder],
  );

  const handleConfirm = () => patch({ status: "confirmed" });
  const handleDeliver = () => patch({ status: "delivered" });
  const handleShip = () => setEtaOpen(true);
  const handleShipConfirm = () => {
    setEtaOpen(false);
    patch({ status: "shipped", estimated_delivery_date: etaValue || defaultEta });
  };
  const handleCancel = () => {
    if (
      !window.confirm(
        "Cancel this order? Stock will be restored and an unpaid (on delivery) payment will be marked cancelled.",
      )
    ) {
      return;
    }
    patch({ status: "cancelled" });
  };

  const handleAddressSave = async (event) => {
    event.preventDefault();
    if (!canEditAddress) return;
    setSaving(true);
    try {
      await API.patch(`/admin/orders/${orderId}`, { shipping: addressForm });
      toast.success("Address saved");
      await fetchOrder();
    } catch (error) {
      toast.error(formatApiError(error) || "Failed to save address");
    } finally {
      setSaving(false);
    }
  };

  const setAddressField = (key, value) => {
    setAddressForm((prev) => ({ ...prev, [key]: value }));
  };

  const disabled = saving || loading;

  const addressBlock = order?.address;
  const lineTotal = (item) => (item.unit_price ?? 0) * item.qty;

  return (
    <AnimatePresence>
      {orderId && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.35 }}
          data-testid="admin-order-detail-drawer"
          className="fixed top-0 right-0 z-[70] h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <h2 className="font-display font-black text-xl text-slate-900">
              Order {order?.order_number || "#"}
            </h2>
            <button
              data-testid="admin-order-detail-close"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close order detail"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto kinetic-scroll px-6 py-4 space-y-6" data-lenis-prevent>
            {loading ? (
              <div data-testid="admin-order-detail-loading" className="flex h-64 items-center justify-center text-slate-400">
                Loading order…
              </div>
            ) : (
              <>
                <header className="flex flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Order status
                  </p>
                  <span
                    data-testid="admin-order-detail-status"
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-tighter ${
                      STATUS_COLORS[order.status] || STATUS_COLORS.placed
                    }`}
                  >
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </header>

                {/* Customer */}
                <section>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Customer
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Mail className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-slate-900" data-testid="admin-order-detail-customer-name">
                          {order.name}
                        </p>
                        <p className="text-xs text-slate-500" data-testid="admin-order-detail-customer-email">
                          {order.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-900" data-testid="admin-order-detail-customer-phone">
                        {order.phone ?? "—"}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Delivery address */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Delivery address
                    </p>
                    {canEditAddress && (
                      <span className="text-[10px] font-bold text-kinetic-red uppercase tracking-wider">
                        Editable while placed
                      </span>
                    )}
                  </div>
                  {canEditAddress ? (
                    <form onSubmit={handleAddressSave} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Full name
                          </label>
                          <input
                            data-testid="admin-order-address-full_name"
                            value={addressForm.full_name}
                            onChange={(event) =>
                              setAddressField("full_name", event.target.value)
                            }
                            className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                            placeholder="Full name"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Phone
                          </label>
                          <input
                            data-testid="admin-order-address-phone"
                            value={addressForm.phone}
                            onChange={(event) =>
                              setAddressField("phone", event.target.value)
                            }
                            className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                            placeholder="Phone"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Email
                          </label>
                          <input
                            data-testid="admin-order-address-email"
                            value={addressForm.email}
                            onChange={(event) =>
                              setAddressField("email", event.target.value)
                            }
                            className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                            placeholder="Email"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Address
                          </label>
                          <input
                            data-testid="admin-order-address-address"
                            value={addressForm.address}
                            onChange={(event) =>
                              setAddressField("address", event.target.value)
                            }
                            className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                            placeholder="Street address"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            City
                          </label>
                          <input
                            data-testid="admin-order-address-city"
                            value={addressForm.city}
                            onChange={(event) =>
                              setAddressField("city", event.target.value)
                            }
                            className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                            placeholder="City"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Pincode
                          </label>
                          <input
                            data-testid="admin-order-address-pincode"
                            value={addressForm.pincode}
                            onChange={(event) =>
                              setAddressField("pincode", event.target.value)
                            }
                            className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-kinetic-red outline-none transition-colors border-slate-200"
                            placeholder="Pincode"
                          />
                        </div>
                      </div>
                      <button
                        data-testid="admin-order-address-save"
                        type="submit"
                        disabled={disabled}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        <Save className="w-4 h-4" /> {disabled ? "Saving…" : "Save address"}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-2 text-sm text-slate-600">
                      {[
                        ["Full name", addressBlock?.full_name],
                        ["Phone", addressBlock?.phone],
                        ["Email", addressBlock?.email],
                        ["Address", addressBlock?.address],
                        ["City", addressBlock?.city],
                        ["Pincode", addressBlock?.pincode],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <span className="w-16 text-[11px] font-bold text-slate-400 uppercase">
                            {label}
                          </span>
                          <span data-testid={`admin-order-address-view-${label.toLowerCase()}`}>
                            {value ?? "—"}
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-400">
                        Address can only be edited while the order is placed.
                      </p>
                    </div>
                  )}
                </section>

                {/* Items */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Items
                    </p>
                    <span className="text-xs font-bold text-slate-400" data-testid="admin-order-items-count">
                      {(order.items ?? []).length} item{(order.items ?? []).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Product</th>
                          <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 w-20">Variant</th>
                          <th className="p-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-16">Unit</th>
                          <th className="p-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-16">Qty</th>
                          <th className="p-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 w-20">Line total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(order.items ?? []).map((item) => (
                          <tr key={item.id} className="text-slate-600">
                            <td className="p-3" data-testid={`admin-order-item-name-${item.id}`}>
                              {item.name}
                            </td>
                            <td className="p-3 text-slate-500" data-testid={`admin-order-item-variant-${item.id}`}>
                              {[item.flavor, item.weight].filter(Boolean).join(" · ") || "Standard"}
                            </td>
                            <td className="p-3 text-right font-semibold" data-testid={`admin-order-item-unit-${item.id}`}>
                              {inr((item.unit_price ?? 0) / 100)}
                            </td>
                            <td className="p-3 text-right font-semibold" data-testid={`admin-order-item-qty-${item.id}`}>
                              {item.qty}
                            </td>
                            <td className="p-3 text-right font-semibold" data-testid={`admin-order-item-line-${item.id}`}>
                              {inr(lineTotal(item) / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Payment */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Payment</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span data-testid="admin-order-payment-method" className="text-sm text-slate-900">
                        {(order.payment?.method ?? "—").replace(/_/g, " ")}
                      </span>
                      <span
                        data-testid="admin-order-payment-status"
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          order.payment?.status === "paid"
                            ? "bg-kinetic-volt/10 text-kinetic-volt border-kinetic-volt/20"
                            : order.payment?.status === "on_delivery"
                              ? "bg-blue-50 text-blue-800 border-blue-100"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {(order.payment?.status ?? "—").replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-900" data-testid="admin-order-payment-amount">
                        {inr((order.payment?.amount ?? 0) / 100)}
                      </span>
                    </div>
                    {order.payment && (
                      <p className="text-[10px] text-slate-400 mt-1" data-testid="admin-order-payment-date">
                        {parseDate(order.payment.created_at).toLocaleDateString(
                          "en-IN",
                        )}
                      </p>
                    )}
                  </div>
                </section>

                {/* Pipeline actions */}
                <section>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Pipeline
                  </p>
                  {etaOpen ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-100 bg-blue-50 p-4">
                        <p className="text-xs font-bold text-blue-800 mb-2">Expected delivery date</p>
                        <input
                          data-testid="admin-order-ship-eta"
                          type="date"
                          value={etaValue}
                          onChange={(event) => setEtaValue(event.target.value)}
                          min={new Date().toISOString().slice(0, 10)}
                          className="w-full rounded-xl border px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-colors border-slate-200"
                        />
                        <p className="text-[10px] text-blue-600 mt-1">
                          Defaults to +5 days from now.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          data-testid="admin-order-action-ship-confirm"
                          onClick={handleShipConfirm}
                          disabled={disabled}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-kinetic-red hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          <Clock className="w-4 h-4" /> Ship order
                        </button>
                        <button
                          data-testid="admin-order-action-ship-cancel"
                          onClick={() => setEtaOpen(false)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        data-testid="admin-order-action-confirm"
                        onClick={handleConfirm}
                        disabled={!canConfirm || disabled}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
                          canConfirm
                            ? "bg-kinetic-red text-white hover:bg-red-600 border-kinetic-red"
                            : "text-slate-400 border-slate-200 bg-white"
                        }`}
                      >
                        Confirm
                      </button>
                      <button
                        data-testid="admin-order-action-ship"
                        onClick={handleShip}
                        disabled={!canShip || disabled}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
                          canShip
                            ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                            : "text-slate-400 border-slate-200 bg-white"
                        }`}
                      >
                        Ship
                      </button>
                      <button
                        data-testid="admin-order-action-deliver"
                        onClick={handleDeliver}
                        disabled={!canDeliver || disabled}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
                          canDeliver
                            ? "bg-kinetic-volt text-white hover:bg-green-600 border-kinetic-volt"
                            : "text-slate-400 border-slate-200 bg-white"
                        }`}
                      >
                        Deliver
                      </button>
                      <button
                        data-testid="admin-order-action-cancel"
                        onClick={handleCancel}
                        disabled={!canCancel || disabled}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
                          canCancel
                            ? "bg-red-50 text-red-800 hover:bg-red-100 border-red-200"
                            : "text-slate-400 border-slate-200 bg-white"
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {order.estimated_delivery_date && (
                    <p className="text-[10px] text-slate-400 mt-3" data-testid="admin-order-eta">
                      Expected delivery:{" "}
                      {parseDate(order.estimated_delivery_date).toLocaleDateString(
                        "en-IN",
                      )}
                    </p>
                  )}
                </section>

                {/* Status history */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Status history
                    </p>
                    <button
                      data-testid="admin-order-history-refresh"
                      onClick={fetchOrder}
                      disabled={loading || saving}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(order.status_history ?? []).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3"
                        data-testid={`admin-order-history-${entry.id}`}
                      >
                        <div className="mt-1 w-2 h-2 rounded-full bg-slate-300" />
                        <div className="flex-1">
                          <p className="text-sm text-slate-900">
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                            {entry.note && ` — ${entry.note}`}
                          </p>
                          <p className="text-[10px] text-slate-400" data-testid={`admin-order-history-date-${entry.id}`}>
                            {parseDate(entry.created_at).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(order.status_history ?? []).length === 0 && (
                      <p className="text-xs text-slate-400" data-testid="admin-order-history-empty">
                        No status changes yet.
                      </p>
                    )}
                  </div>
                </section>

                {/* Email log */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Buyer emails
                    </p>
                    <span className="text-xs font-bold text-slate-400" data-testid="admin-order-email-count">
                      {order.email_log.length}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">To</th>
                          <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 w-24">Template</th>
                          <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 w-20">Status</th>
                          <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(order.email_log ?? []).map((entry) => (
                          <tr key={entry.id} className="text-slate-600">
                            <td className="p-3" data-testid={`admin-order-email-to-${entry.id}`}>
                              {entry.to_email}
                            </td>
                            <td className="p-3 text-slate-500" data-testid={`admin-order-email-template-${entry.id}`}>
                              {entry.template}
                            </td>
                            <td className="p-3" data-testid={`admin-order-email-status-${entry.id}`}>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  entry.status === "sent"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : entry.status === "skipped"
                                      ? "bg-slate-100 text-slate-500 border-slate-200"
                                      : "bg-red-50 text-red-700 border-red-100"
                                }`}
                              >
                                {entry.status}
                              </span>
                              {entry.error && (
                                <span className="text-[10px] text-red-600 ml-2" data-testid={`admin-order-email-error-${entry.id}`}>
                                  {entry.error}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-500" data-testid={`admin-order-email-date-${entry.id}`}>
                              {parseDate(entry.created_at).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                        {(order.email_log ?? []).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-slate-400 text-xs" data-testid="admin-order-email-empty">
                              No emails sent for this order yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
